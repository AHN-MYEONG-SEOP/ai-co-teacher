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

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const { messages, studentText, withTranslation, currentBook, currentUnit, phase } = await req.json()

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
      return NextResponse.json({
        text: res.choices[0]?.message?.content || `${greeting}, ${nickname}! How's the weather today?`,
        unitTitle: unitData?.title || '',
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
Never use Korean. Keep responses SHORT (1-2 sentences max).

IMPORTANT RULES:
1. Always end your response with a question — never end with a statement
2. Sometimes ask students to express a Korean phrase in English, like: "How do you say '오늘 날씨가 맑아' in English?" or "Can you say '나는 사과를 좋아해' in English?"
3. Mix between asking questions about the topic AND asking them to translate Korean expressions
4. Keep questions simple and appropriate for the student's level
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
- ALWAYS end with a question (never a statement)
- Alternate between: asking about lesson content, asking to translate Korean → English
- Korean → English examples: "How do you say '${unitData.words.split(',')[0]?.trim()}' in a sentence?", "Can you say '나는 ${unitData.words.split(',')[1]?.trim() || '...'}이 있어' in English?"
- Use target words naturally in questions
- Ask ONE question at a time
- Gently correct mistakes: say the correct form first, then ask again
- Praise briefly ("Great!" "Good job!") then ask next question
- ${levelGuide}` : ''
    }

    const conversationMessages = [
      { role: 'system' as const, content: systemContent },
      ...(messages || []),
      { role: 'user' as const, content: studentText },
    ]

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: conversationMessages,
      max_tokens: 100,
      temperature: 0.7,
    })

    const aiText = response.choices[0]?.message?.content || ''

    // 선택지 생성
    let choices: string[] = []
    if (['study', 'review', 'confirm_unit', 'weather'].includes(phase) && aiText) {
      const choicesRes = await openai.chat.completions.create({
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
      try {
        const raw = choicesRes.choices[0]?.message?.content || '[]'
        choices = JSON.parse(raw.replace(/```json|```/g, '').trim())
      } catch {
        choices = []
      }
    }

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

    return NextResponse.json({ text: aiText, translation, choices, nextPhase, ...responseExtra, role: 'assistant' })

  } catch (error) {
    console.error('GPT 오류:', error)
    return NextResponse.json({ error: 'GPT API 오류' }, { status: 500 })
  }
}
