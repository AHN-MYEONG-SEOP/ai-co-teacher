import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import curriculumData from '@/data/curriculum.json'
import { buildSystemPrompt, type LessonScenarioRow, type PersonaRow } from '@/prompts/system-prompt'
import { progressRate, pushUnique } from '@/lib/lesson'

export const dynamic = 'force-dynamic'

// 클로징 종료 신호 — system-prompt.ts의 마지막 종료 문장에 포함되는 영어 문구
const SESSION_END_MARK = "That's all for today"

const curriculum = curriculumData as {
  level_order: string[]
  curriculum: Record<string, Record<string, Record<string, {
    unit: number; title?: string; words: string
    objectives: string; sentence_patterns?: string; grammar?: string
  }>>>
}

function getUnitData(book: string, unit: number) {
  for (const level of Object.values(curriculum.curriculum)) {
    if (level[book]?.[String(unit)]) return level[book][String(unit)]
  }
  return null
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// 교재 레벨에 맞는 언어 수준 지시
function getLevelGuide(book: string): string {
  if (book.includes('Phonics') || book.includes('Builder')) {
    return 'Use very simple words. Short sentences only (3-5 words). Like talking to a 6-7 year old child.'
  }
  if (book.includes('Challenger')) {
    return 'Use simple sentences. Like talking to a 8-9 year old. Keep it fun and easy.'
  }
  if (book.includes('Explorer')) {
    return 'Use clear sentences. Like talking to a 10-11 year old.'
  }
  return 'Use natural sentences appropriate for middle school level.'
}

// 영어 → 한국어 번역 (번역 보기 버튼용)
async function translate(openai: OpenAI, text: string): Promise<string> {
  if (!text) return ''
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: '영어를 자연스러운 한국어로 번역. 번역만 출력.' },
        { role: 'user', content: text },
      ],
      max_tokens: 100,
      temperature: 0.3,
    })
    return res.choices[0]?.message?.content || ''
  } catch {
    return ''
  }
}

interface ChatMessage { role: 'user' | 'assistant'; content: string }
interface ProgressData {
  current_step?: number
  completed_steps?: number[]
  natural_steps?: number[]
  hint_used_steps?: number[]
}

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const body = await req.json()
    const {
      messages, studentText, studentId, scenarioId, progressId, nickname,
      hintUsed: clientHintUsed,
      progressData, currentBook, currentUnit,
    }: {
      messages?: ChatMessage[]
      studentText?: string
      studentId?: string
      scenarioId?: string | null
      progressId?: string | null
      nickname?: string
      hintUsed?: boolean
      progressData?: ProgressData
      currentBook?: string
      currentUnit?: number
    } = body

    if (!studentText) {
      return NextResponse.json({ error: 'studentText required' }, { status: 400 })
    }

    const levelGuide = getLevelGuide(currentBook || '')

    // ── 인사 (수업 시작) ─────────────────────────────────
    // scenarioId 있으면 시나리오 첫 step의 ai_line으로 오프닝, 없으면 일반 인사
    if (studentText.startsWith('__GREETING__:')) {
      const name = studentText.replace('__GREETING__:', '').trim() || nickname || 'friend'
      let openingText = ''
      let unitTitle = ''
      let openingScene = ''
      let openingSceneStep = 0

      let greetingFirstStep: Record<string, unknown> | null = null
      if (scenarioId) {
        const supabase = getSupabase()
        const { data: scenario } = await supabase
          .from('lesson_scenarios')
          .select('title, phases')
          .eq('id', scenarioId)
          .maybeSingle()
        unitTitle = scenario?.title || ''
        const firstStep = scenario?.phases?.[0]?.steps?.[0]
        greetingFirstStep = firstStep ?? null
        if (firstStep?.ai_line) {
          openingText = String(firstStep.ai_line).replace(/\{\{nickname\}\}/g, name)
        }
        if (firstStep?.scene_kr) {
          openingScene = String(firstStep.scene_kr)
          openingSceneStep = typeof firstStep.step === 'number' ? firstStep.step : 1
        }
      }

      if (!openingText) {
        const res = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: `You are Coty, a friendly English teacher for Korean elementary students. ${levelGuide} Never use Korean.` },
            { role: 'user', content: `Greet ${name} warmly and ask one simple opening question. Max 2 short sentences.` },
          ],
          max_tokens: 60,
          temperature: 0.7,
        })
        openingText = res.choices[0]?.message?.content || `Hi ${name}! How are you today?`
      }

      // GREETING: 첫 step의 hint_line + accept_variants 반환
      // greetingFirstStep은 위에서 이미 추출됨
      const greetingHintLine = greetingFirstStep?.hint_line
        ? String(greetingFirstStep.hint_line).replace(/\{\{nickname\}\}/g, name)
        : undefined
      const greetingAcceptVariants = (greetingFirstStep?.accept_variants as string[]) ?? []
      return NextResponse.json({
        text: openingText, message: openingText, unitTitle,
        hint_line: greetingHintLine,
        accept_variants: greetingAcceptVariants.length > 0 ? greetingAcceptVariants : undefined,
        ...(openingScene ? { scene_kr: openingScene, scene_step: openingSceneStep } : {}),
        role: 'assistant',
      })
    }

    // ── 인식 불명확 되묻기 ───────────────────────────────
    // ── 계속 진행 ─────────────────────────────────────────
    if (studentText === '__CONTINUE__') {
      const supabase = getSupabase()
      const { data: scenarioData } = scenarioId ? await supabase
        .from('lesson_scenarios')
        .select('phases')
        .eq('id', scenarioId)
        .maybeSingle() : { data: null }
      const attemptingStep = progressData?.current_step ?? 1
      const allSteps = ((scenarioData?.phases ?? []) as {steps?: {step: number, ai_line?: string, scene_kr?: string}[]}[])
        .flatMap(p => p?.steps ?? [])
      const curStep = allSteps.find(s => s?.step === attemptingStep)
      const aiLine = curStep?.ai_line?.replace(/\{\{nickname\}\}/g, nickname || 'student') ?? "Let's try again!"
      const sceneKr = curStep?.scene_kr?.replace(/\{\{nickname\}\}/g, nickname || 'student') ?? ''
      const translation = await translate(openai, aiLine)
      return NextResponse.json({
        text: aiLine,
        message: aiLine,
        translation,
        scene_kr: sceneKr || undefined,
        scene_step: sceneKr ? attemptingStep : undefined,
        role: 'assistant'
      })
    }

    // ── 다시 피드백 (마이크 재활성화만) ──────────────────────
    if (studentText === '__RETRY__') {
      return NextResponse.json({
        text: '',
        message: '',
        role: 'assistant'
      })
    }

    if (studentText.startsWith('__CLARIFY__:')) {
      const partial = studentText.replace('__CLARIFY__:', '').trim()
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: `You are Coty. Ask to repeat in 1 simple sentence. ${levelGuide} Never use Korean.` },
          { role: 'user', content: `Heard: "${partial}". Ask to clarify.` },
        ],
        max_tokens: 40,
        temperature: 0.7,
      })
      const t = res.choices[0]?.message?.content || 'Can you say that again?'
      return NextResponse.json({ text: t, message: t, role: 'assistant' })
    }

    const history: ChatMessage[] = Array.isArray(messages) ? messages : []
    const last = history[history.length - 1]
    const alreadyHasCurrent = last?.role === 'user' && last?.content === studentText
    const convoHistory = alreadyHasCurrent ? history : [...history, { role: 'user' as const, content: studentText }]

    const supabase = getSupabase()

    // ── 시나리오 로드 ────────────────────────────────────
    let scenario: LessonScenarioRow | null = null
    if (scenarioId) {
      const { data } = await supabase
        .from('lesson_scenarios')
        .select('*')
        .eq('id', scenarioId)
        .maybeSingle()
      scenario = (data as LessonScenarioRow) ?? null
    }

    // ── 시나리오 없음 → 일반 Coty 대화 (템플릿 미보유 교재 대비) ──
    if (!scenario) {
      const unitData = currentBook && currentUnit ? getUnitData(currentBook, currentUnit) : null
      const systemContent = `You are Coty, a friendly English teacher for Korean elementary students.
${levelGuide}
Never use Korean.
STRICT RULES:
1. MAX 2 sentences. Only ONE question, always as the LAST sentence.
2. If the student's answer doesn't match your question, point it out kindly and ask again.
${unitData ? `\nToday's lesson: ${currentBook}, Unit ${currentUnit} - "${unitData.title || ''}"\nTarget words: ${unitData.words}\nKey patterns: ${unitData.sentence_patterns || ''}` : ''}`

      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: systemContent }, ...convoHistory],
        max_tokens: 120,
        temperature: 0.7,
      })
      const aiText = res.choices[0]?.message?.content || ''
      const translation = await translate(openai, aiText)
      return NextResponse.json({ text: aiText, message: aiText, translation, role: 'assistant' })
    }

    // ── 페르소나 로드 ────────────────────────────────────
    let persona: PersonaRow = null
    if (studentId) {
      const { data } = await supabase
        .from('student_personas')
        .select('*')
        .eq('student_id', studentId)
        .maybeSingle()
      persona = (data as PersonaRow) ?? null
    }

    // ── 시스템 프롬프트 + GPT 호출 (JSON) ────────────────
    // 현재 학생이 도전 중인 step(이번 발화로 판정할 대상)을 프롬프트에 명시
    const attemptingStep = progressData?.current_step ?? 1
    // 이미 모든 step 완료된 상태면 closing 처리
    const alreadyCompleted = (progressData?.completed_steps ?? []).length >= scenario.total_steps
    const systemPrompt = buildSystemPrompt(scenario, persona, nickname || 'student', attemptingStep, alreadyCompleted)
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, ...convoHistory],
      max_tokens: 400,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const rawContent = response.choices[0]?.message?.content || ''
    let aiText = ''
    let stepCompleted: number | null = null
    let gptHintUsed = false
    let wordSpokenNaturally: string | null = null
    let personaUpdate: Record<string, unknown> | null = null
    let feedbackGrammar: number | null = null
    let feedbackOverall: number | null = null
    let retryReason: string | null = null
    let pronunciation: Record<string, unknown> | null = null
    try {
      const parsed = JSON.parse(rawContent.replace(/```json|```/g, '').trim())
      aiText = typeof parsed.message === 'string' ? parsed.message
        : typeof parsed.text === 'string' ? parsed.text : ''
      if (typeof parsed.step_completed === 'number') stepCompleted = parsed.step_completed
      gptHintUsed = parsed.hint_used === true
      if (typeof parsed.word_spoken_naturally === 'string') wordSpokenNaturally = parsed.word_spoken_naturally
      if (parsed.persona_update && typeof parsed.persona_update === 'object' &&
          Object.keys(parsed.persona_update).length > 0) {
        personaUpdate = parsed.persona_update
      }
      if (parsed.feedback && typeof parsed.feedback === 'object') {
        feedbackGrammar = parsed.feedback.grammar ?? null
        feedbackOverall = parsed.feedback.overall ?? null
        retryReason = parsed.feedback.retry_reason ?? null
        pronunciation = parsed.feedback.pronunciation ?? null
      }
    } catch {
      console.error('chat JSON 파싱 실패. raw:', rawContent)
      aiText = rawContent
    }

    // 힌트 사용 여부 = GPT 판단 OR 클라이언트(선택지 버튼 본 경우)
    const hintUsed = gptHintUsed || clientHintUsed === true

    // ── lesson_progress 갱신 ─────────────────────────────
    let completedSteps = progressData?.completed_steps ?? []
    let naturalSteps = progressData?.natural_steps ?? []
    let hintUsedSteps = progressData?.hint_used_steps ?? []
    let currentStep = progressData?.current_step ?? 1
    let completed = false

    if (stepCompleted != null) {
      completedSteps = pushUnique(completedSteps, stepCompleted)
      if (hintUsed) {
        hintUsedSteps = pushUnique(hintUsedSteps, stepCompleted)
      } else {
        naturalSteps = pushUnique(naturalSteps, stepCompleted)
      }
      currentStep = stepCompleted + 1
      completed = completedSteps.length >= scenario.total_steps

      // 회차(attempt) 행을 id 기준으로 갱신 — 같은 날 여러 회차가 공존해도 정확히 그 회차만 업데이트
      if (progressId) {
        await supabase
          .from('lesson_progress')
          .update({
            current_step: currentStep,
            completed_steps: completedSteps,
            natural_steps: naturalSteps,
            hint_used_steps: hintUsedSteps,
            completed,
            ...(completed ? { completed_at: new Date().toISOString() } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq('id', progressId)
      }
    }

    const rate = progressRate(naturalSteps, scenario.total_steps)

    // ── 새 step 진입 시에만 한국어 상황 설명 안내 ──
    // step을 완료해 다음 step으로 넘어간 턴에만 표시한다.
    // (오답으로 같은 step을 다시 질문하는 턴(stepCompleted==null)에는 보내지 않아
    //  '다음 step의 scene_kr이 미리 노출'되는 문제를 방지)
    let sceneKr = ''
    let sceneStep = 0
    if (stepCompleted != null && !completed) {
      const steps = (scenario.phases ?? []).flatMap(p => p?.steps ?? [])
      const cur = steps.find(s => s?.step === currentStep)
      if (cur?.scene_kr) { sceneKr = String(cur.scene_kr); sceneStep = currentStep }
    }

    // ── 세션 종료 신호 감지 (클로징 마지막 턴) ───────────
    // 아포스트로피(' vs ')·대소문자 차이를 무시하고 매칭
    const normalize = (s: string) => s.toLowerCase().replace(/[’']/g, "'")
    const sessionEnded = normalize(aiText).includes(normalize(SESSION_END_MARK))

    // ── hint_line + accept_variants 추출 ─────────────────
    // step 완료 턴: 다음 step(currentStep) 기준
    // 오답/진행 중 턴: 현재 도전 중인 step(attemptingStep) 기준
    const allSteps = (scenario.phases ?? []).flatMap(p => p?.steps ?? [])
    const hintTargetStep = (stepCompleted != null && !completed) ? currentStep : attemptingStep
    const activeStep = allSteps.find(s => s?.step === hintTargetStep)
    const hintLine: string = activeStep?.hint_line
      ? String(activeStep.hint_line).replace(/\{\{nickname\}\}/g, nickname || 'student')
      : ''
    const acceptVariants: string[] = activeStep?.accept_variants ?? []

    // ── 번역 ─────────────────────────────────────────────
    const translation = sessionEnded ? '' : await translate(openai, aiText)

    return NextResponse.json({
      text: aiText,
      message: aiText,
      step_completed: stepCompleted,
      hint_used: hintUsed,
      word_spoken_naturally: wordSpokenNaturally,
      session_ended: sessionEnded,
      progress: {
        current_step: currentStep,
        completed_steps: completedSteps,
        natural_steps: naturalSteps,
        hint_used_steps: hintUsedSteps,
        progress_rate: rate,
        completed,
      },
      ...(personaUpdate ? { persona_update: personaUpdate } : {}),
      ...(sceneKr ? { scene_kr: sceneKr, scene_step: sceneStep } : {}),
      hint_line: hintLine || undefined,
      accept_variants: acceptVariants.length > 0 ? acceptVariants : undefined,
      translation,
      feedback: {
        grammar: feedbackGrammar,
        overall: feedbackOverall,
        retry_reason: retryReason,
        pronunciation: pronunciation,
      },
      role: 'assistant',
    })

  } catch (error) {
    console.error('GPT 오류:', error)
    return NextResponse.json({ error: 'GPT API 오류' }, { status: 500 })
  }
}
