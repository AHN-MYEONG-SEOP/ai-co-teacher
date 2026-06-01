import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import curriculumData from '@/data/curriculum.json'

export const dynamic = 'force-dynamic'

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

function getPrevUnitData(book: string, unit: number) {
  for (const level of Object.values(curriculum.curriculum)) {
    if (!level[book]) continue
    const units = Object.keys(level[book]).map(Number).sort((a, b) => a - b)
    const idx = units.indexOf(unit)
    if (idx > 0) return level[book][String(units[idx - 1])]
  }
  return null
}

function getKSTInfo() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December']
  return {
    dayName: days[kst.getUTCDay()],
    monthName: months[kst.getUTCMonth()],
    date: kst.getUTCDate(),
    hours: kst.getUTCHours(),
  }
}

function getGreeting(hours: number) {
  if (hours < 12) return 'Good morning'
  if (hours < 18) return 'Good afternoon'
  return 'Good evening'
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

// AI 질문에 대한 학생 답변 선택지 3개 생성 (힌트 버튼용) — 모든 phase 공통
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
- If teacher asked to translate Korean → English, give 3 English translation options
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

// 페르소나를 GPT 시스템 프롬프트용 텍스트로 변환
function formatPersona(persona: Record<string, unknown> | null | undefined, nickname?: string): string {
  if (!persona || typeof persona !== 'object') return ''
  const lines: string[] = []
  if (nickname) lines.push(`- Name: ${nickname}`)
  const pick = (key: string, label: string) => {
    const v = persona[key]
    if (v && typeof v === 'object' && Object.keys(v).length > 0) {
      lines.push(`- ${label}: ${JSON.stringify(v)}`)
    }
  }
  pick('hobbies', 'Interests')
  pick('family_members', 'Family')
  pick('food_preferences', 'Food')
  pick('school_life', 'School')
  pick('nature', 'Pets/Nature')
  pick('future', 'Dream')
  pick('personality', 'Personality')
  const lp = persona.learning_patterns as Record<string, unknown> | undefined
  if (lp?.weak_points) lines.push(`- Weak points (focus extra): ${JSON.stringify(lp.weak_points)}`)
  const facts = persona.free_facts
  if (Array.isArray(facts) && facts.length > 0) lines.push(`- Known facts: ${facts.join('; ')}`)
  if (lines.length === 0) return ''
  return `\nSTUDENT PROFILE (use naturally to create situations — NEVER read it out loud):\n${lines.join('\n')}\n`
}

// 시나리오(jsonb)를 GPT 지침 텍스트로 변환
function formatScenario(scenario: Record<string, unknown> | null | undefined, pendingTargets?: string[]): string {
  if (!scenario || typeof scenario !== 'object') return ''
  const parts: string[] = ['\nTODAY\'S LESSON SCENARIO (follow loosely, stay natural — do NOT recite it):']
  if (scenario.opening) parts.push(`Opening idea: ${scenario.opening}`)
  if (scenario.bridge) parts.push(`Bridge to today's unit: ${scenario.bridge}`)
  const stages = scenario.stages
  if (Array.isArray(stages) && stages.length > 0) {
    parts.push('Techniques to make the STUDENT produce each target:')
    for (const s of stages.slice(0, 12) as Record<string, unknown>[]) {
      parts.push(`  • [${s.type}] "${s.target}" via ${s.technique || 'conversation'} — ${s.setup || ''}`)
    }
  }
  if (Array.isArray(pendingTargets) && pendingTargets.length > 0) {
    parts.push(`STILL NEEDED (drive the student to SAY these themselves): ${pendingTargets.join(', ')}`)
  }
  if (scenario.closing) parts.push(`Closing idea: ${scenario.closing}`)
  return parts.join('\n') + '\n'
}

// 학생 주도 유도 규칙 + JSON 출력 형식
const INITIATIVE_RULES = `
STUDENT-INITIATIVE RULES (critical):
- Never ask more than 2 questions in a row. After that, flip roles: "Now YOU ask ME!"
- Pretend you don't know the student's favorite topics so the student explains.
- Sometimes make a deliberate, obvious mistake so the student corrects you.
- The target words/patterns must come FROM THE STUDENT — do not say them first.
`

const JSON_OUTPUT_RULE = `
RESPOND WITH A JSON OBJECT ONLY (no markdown, no backticks):
{
  "text": "<your spoken reply — obey ALL rules above (max 2 sentences, one question at the end)>",
  "stage_progress": [ { "target": "<target word or pattern>", "used_form": "<exact words the student said>", "natural_use": true, "hint_used": false } ],
  "persona_update": { }
}
stage_progress: list ONLY target words/patterns that the STUDENT produced THEMSELVES in their latest message. Accept variations (tall/taller, who is he/who is she). Empty array [] if none. NEVER count words the AI said.
persona_update: only BRAND-NEW info learned about the student in their latest message, matching keys like hobbies/family_members/food_preferences/nature/school_life/future/personality/free_facts. Use {} if nothing new.`

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const { messages, studentText, withTranslation, currentBook, currentUnit, phase, persona, scenario, pendingTargets } = await req.json()

    if (!studentText) {
      return NextResponse.json({ error: 'studentText required' }, { status: 400 })
    }

    const { dayName, monthName, date, hours } = getKSTInfo()
    const greeting = getGreeting(hours)
    const levelGuide = getLevelGuide(currentBook || '')
    const unitData = currentBook && currentUnit ? getUnitData(currentBook, currentUnit) : null
    const prevData = currentBook && currentUnit ? getPrevUnitData(currentBook, currentUnit) : null

    // ── 1단계: 인사 + 날씨 질문 ─────────────────────────
    if (studentText.startsWith('__GREETING__:')) {
      const nickname = studentText.replace('__GREETING__:', '').trim()

      const prompt = `You are Coty, a friendly English teacher for Korean elementary students.
${levelGuide}

Say hi to ${nickname} with today's date (${dayName}, ${monthName} ${date}).
Then ask ONE simple question about the weather.
Max 2 short sentences. Never use Korean.

Example: "Good morning, Minho! Today is Monday, June 3rd. How's the weather today?"`

      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: prompt }, { role: 'user', content: 'Generate greeting.' }],
        max_tokens: 60,
        temperature: 0.7,
      })
      const greetingText = res.choices[0]?.message?.content || `${greeting}, ${nickname}! How's the weather today?`
      const choices = await generateChoices(openai, greetingText, levelGuide)
      return NextResponse.json({
        text: greetingText,
        unitTitle: unitData?.title || '',
        choices,
        nextPhase: 'weather',
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
      return NextResponse.json({ text: res.choices[0]?.message?.content || "Can you say that again?", role: 'assistant' })
    }

    // ── phase별 대화 처리 ────────────────────────────────
    const now = new Date()
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
    const days_ko = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
    const timeStr = `${days_ko[kst.getUTCDay()]} ${kst.getUTCHours()}시`

    let systemContent = `You are Coty, a friendly English teacher for Korean elementary students.
Current time: ${timeStr}
${levelGuide}
Never use Korean.

STRICT RULES — follow every single time:
1. MAX 2 sentences total. Never write 3 or more sentences.
2. Only ONE question per response — always the LAST sentence.
3. The last sentence MUST be a question. Never end with a statement.
4. Do NOT combine multiple topics in one response. One idea only.
5. CONTEXT CHECK: If student's answer doesn't match your question, point it out kindly and ask the same question again. Example: Asked "Is she tall?" → student said "I like pizza." → "That doesn't answer my question. Is she tall or short?"
6. Sometimes ask students to translate a Korean phrase: "How do you say '오늘 날씨가 맑아' in English?"
`

    let nextPhase = phase
    let responseExtra = {}

    // phase별 지시
    if (phase === 'weather') {
      // 날씨 답변 받은 후 → 복습 시작
      const reviewPrompt = prevData
        ? `Student answered about weather. React briefly (1 sentence).
Then say: "Last time we learned about '${prevData.title || ''}'. Let's review!"
Then ask ONE simple question using these words: ${prevData.words.split(',').slice(0, 4).join(', ')}
Use sentence patterns like: ${prevData.sentence_patterns?.split('\n')[0] || ''}
Keep it very simple for elementary students.`
        : `Student answered about weather. React briefly.
Then say "Let's start today's lesson!" and move to study phase.`

      systemContent += reviewPrompt
      nextPhase = prevData ? 'review' : 'confirm_unit'

    } else if (phase === 'review') {
      // 복습 Q&A 진행 (2-3번 후 → confirm_unit으로)
      const reviewCount = messages.filter((m: {role: string}) => m.role === 'user').length
      systemContent += `You are reviewing Unit ${currentUnit ? currentUnit - 1 : ''}: "${prevData?.title || ''}".
Review words: ${prevData?.words || ''}
Key patterns: ${prevData?.sentence_patterns || ''}

${reviewCount >= 3
  ? `Good review! Now tell student: "Good job! Now let's check today's lesson."
     Then say: "Today we'll study ${currentBook}, Unit ${currentUnit}${unitData?.title ? ` - '${unitData.title}'` : ''}. Is that right?"
     nextPhase should be confirm_unit.`
  : `Ask ONE simple review question. Use the vocabulary and patterns from the previous lesson.
     Keep questions very simple (for ${levelGuide.includes('6-7') ? '6-7' : '8-10'} year olds).`}
`
      if (reviewCount >= 3) nextPhase = 'confirm_unit'

    } else if (phase === 'confirm_unit') {
      // Unit 확인 → 맞으면 study, 틀리면 물어보기
      const studentLower = studentText.toLowerCase()
      const isYes = ['yes', 'yeah', 'ok', 'okay', 'sure', 'right', 'yep', '네', '응', '맞아'].some(w => studentLower.includes(w))
      const isNo = ['no', 'nope', 'wrong', 'different', '아니', '아니요', '틀려'].some(w => studentLower.includes(w))

      if (isYes) {
        systemContent += `Student confirmed today's lesson: ${currentBook}, Unit ${currentUnit} - "${unitData?.title || ''}".
Say "Great! Let's start!" and introduce the first 2-3 words from: ${unitData?.words.split(',').slice(0, 3).join(', ')}.
Ask a simple question using one of these words.`
        nextPhase = 'study'

      } else if (isNo) {
        // 학생이 다른 unit을 원함 - 어떤 unit인지 물어보기
        systemContent += `Student wants a different lesson. Ask: "Which unit would you like to study? Tell me the unit number."`
        nextPhase = 'confirm_unit'

      } else {
        // 숫자가 있으면 unit 변경
        const unitMatch = studentText.match(/\d+/)
        if (unitMatch) {
          const requestedUnit = parseInt(unitMatch[0])
          const requestedData = getUnitData(currentBook || '', requestedUnit)
          if (requestedData) {
            systemContent += `Student wants Unit ${requestedUnit}${requestedData.title ? ` - "${requestedData.title}"` : ''}.
Say "OK! Let's study Unit ${requestedUnit}!" and introduce first words: ${requestedData.words.split(',').slice(0, 3).join(', ')}.`
            nextPhase = 'study'
            responseExtra = { newUnit: requestedUnit, newBook: currentBook }
          } else {
            systemContent += `Unit ${requestedUnit} not found. Ask student to choose a valid unit number.`
          }
        } else {
          systemContent += `Not sure what student wants. Confirm today's lesson: Unit ${currentUnit} - "${unitData?.title || ''}". Ask yes or no.`
        }
      }

    } else {
      // study phase — 교재 내용으로 대화
      systemContent += unitData ? `
Current lesson: ${currentBook}, Unit ${currentUnit} - "${unitData.title || ''}"
Target words: ${unitData.words}
Objectives: ${unitData.objectives}
Key patterns: ${unitData.sentence_patterns || ''}
Grammar: ${unitData.grammar || ''}

Teaching rules:
- MAX 2 sentences. ONE question at the end only.
- Use target words naturally in your ONE question
- If answer is wrong: correct it in 1 sentence, then ask again
- If answer is right: praise in 1 word ("Great!"), then next question
- ${levelGuide}` : ''
    }

    // ── 페르소나 + 시나리오 + 학생 주도 규칙 주입 ──────────
    systemContent += INITIATIVE_RULES
    systemContent += formatPersona(persona)
    if (phase === 'study') {
      systemContent += formatScenario(scenario?.scenario || scenario, pendingTargets)
    }
    systemContent += JSON_OUTPUT_RULE

    // 호출자(useConversation)가 이미 현재 학생 발화를 messages 끝에 push해서 보내므로
    // 여기서 또 붙이면 동일 발화가 중복 전달된다 → 마지막 메시지가 현재 발화면 재추가하지 않음
    const history = messages || []
    const last = history[history.length - 1]
    const alreadyHasCurrent = last?.role === 'user' && last?.content === studentText
    const conversationMessages = [
      { role: 'system' as const, content: systemContent },
      ...history,
      ...(alreadyHasCurrent ? [] : [{ role: 'user' as const, content: studentText }]),
    ]

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: conversationMessages,
      max_tokens: 300,
      temperature: 0.7,
      response_format: { type: 'json_object' },
    })

    const rawContent = response.choices[0]?.message?.content || ''

    // JSON 응답 파싱 — { text, stage_progress, persona_update }
    // gpt-4o-mini가 백틱 펜스로 감싸는 경우 대비해 제거 후 파싱
    let aiText = ''
    let stageProgress: unknown[] = []
    let personaUpdate: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(rawContent.replace(/```json|```/g, '').trim())
      aiText = typeof parsed.text === 'string' ? parsed.text : ''
      if (Array.isArray(parsed.stage_progress)) stageProgress = parsed.stage_progress
      if (parsed.persona_update && typeof parsed.persona_update === 'object') {
        personaUpdate = parsed.persona_update
      }
    } catch {
      // 파싱 실패 시 원문을 그대로 답변으로 사용 (대화 끊김 방지)
      console.error('chat JSON 파싱 실패. raw:', rawContent)
      aiText = rawContent
    }

    // 선택지 생성 — 모든 phase에서 항상 힌트 제공
    const choices = await generateChoices(openai, aiText, levelGuide)

    // 번역 — 항상 생성
    let translation = ''
    if (aiText) {
      const translRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '영어를 자연스러운 한국어로 번역. 번역만 출력.' },
          { role: 'user', content: aiText },
        ],
        max_tokens: 100,
        temperature: 0.3,
      })
      translation = translRes.choices[0]?.message?.content || ''
    }

    // persona_update가 비어있지 않을 때만 내려보냄
    const hasPersonaUpdate = personaUpdate && Object.keys(personaUpdate).length > 0

    return NextResponse.json({
      text: aiText,
      translation,
      choices,
      stage_progress: stageProgress,
      ...(hasPersonaUpdate ? { persona_update: personaUpdate } : {}),
      nextPhase,
      ...responseExtra,
      role: 'assistant',
    })

  } catch (error) {
    console.error('GPT 오류:', error)
    return NextResponse.json({ error: 'GPT API 오류' }, { status: 500 })
  }
}
