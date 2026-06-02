import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import curriculumData from '@/data/curriculum.json'
import { buildSystemPrompt, type LessonScenarioRow, type PersonaRow } from '@/prompts/system-prompt'
import { kstToday, progressRate, pushUnique } from '@/lib/lesson'

export const dynamic = 'force-dynamic'

// 클로징 종료 신호 — system-prompt.ts의 마지막 종료 문장과 동일해야 함
const SESSION_END_MARK = '오늘 대화는 여기까지입니다'

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

// AI 질문에 대한 학생 답변 선택지 3개 생성 (힌트 버튼용)
async function generateChoices(openai: OpenAI, aiText: string, levelGuide: string): Promise<string[]> {
  if (!aiText) return []
  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `Generate 3 short English answer choices for this teacher's question.
${levelGuide}
Rules:
- Each choice max 6 words
- Make them natural and varied
- If yes/no question, include yes and no variants
- Respond ONLY with JSON array: ["choice1", "choice2", "choice3"]
- No other text`,
        },
        { role: 'user', content: `Teacher: "${aiText}"\nGenerate 3 student response choices.` },
      ],
      max_tokens: 80,
      temperature: 0.7,
    })
    const raw = res.choices[0]?.message?.content || '[]'
    return JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    return []
  }
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
      messages, studentText, studentId, scenarioId, nickname,
      hintUsed: clientHintUsed,
      progressData, currentBook, currentUnit,
    }: {
      messages?: ChatMessage[]
      studentText?: string
      studentId?: string
      scenarioId?: string | null
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

      if (scenarioId) {
        const supabase = getSupabase()
        const { data: scenario } = await supabase
          .from('lesson_scenarios')
          .select('title, phases')
          .eq('id', scenarioId)
          .maybeSingle()
        unitTitle = scenario?.title || ''
        const firstStep = scenario?.phases?.[0]?.steps?.[0]
        if (firstStep?.ai_line) {
          openingText = String(firstStep.ai_line).replace(/\{\{nickname\}\}/g, name)
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

      const choices = await generateChoices(openai, openingText, levelGuide)
      return NextResponse.json({
        text: openingText, message: openingText, unitTitle, choices,
        role: 'assistant',
      })
    }

    // ── 인식 불명확 되묻기 ───────────────────────────────
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
      const [choices, translation] = await Promise.all([
        generateChoices(openai, aiText, levelGuide),
        translate(openai, aiText),
      ])
      return NextResponse.json({ text: aiText, message: aiText, choices, translation, role: 'assistant' })
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
    const systemPrompt = buildSystemPrompt(scenario, persona, nickname || 'student')
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

      if (studentId) {
        const today = kstToday()
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
          .eq('student_id', studentId)
          .eq('scenario_id', scenario.id)
          .eq('session_date', today)
      }
    }

    const rate = progressRate(naturalSteps, scenario.total_steps)

    // ── 세션 종료 신호 감지 (클로징 마지막 턴) ───────────
    const sessionEnded = aiText.includes(SESSION_END_MARK)

    // ── 힌트 선택지 + 번역 ───────────────────────────────
    // 세션 종료 턴에는 답할 차례가 없으므로 힌트 선택지 생략
    const [choices, translation] = await Promise.all([
      sessionEnded ? Promise.resolve([] as string[]) : generateChoices(openai, aiText, levelGuide),
      translate(openai, aiText),
    ])

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
      choices,
      translation,
      role: 'assistant',
    })

  } catch (error) {
    console.error('GPT 오류:', error)
    return NextResponse.json({ error: 'GPT API 오류' }, { status: 500 })
  }
}
