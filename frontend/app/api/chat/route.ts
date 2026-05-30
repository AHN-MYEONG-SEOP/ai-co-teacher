import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import curriculumData from '@/data/curriculum.json'

export const dynamic = 'force-dynamic'

const curriculum = curriculumData as {
  level_order: string[]
  curriculum: Record<string, Record<string, Record<string, {
    unit: number
    title?: string
    words: string
    objectives: string
    sentence_patterns?: string
    grammar?: string
  }>>>
}

function getUnitData(book: string, unit: number) {
  for (const level of Object.values(curriculum.curriculum)) {
    if (level[book]?.[String(unit)]) {
      return level[book][String(unit)]
    }
  }
  return null
}

function getPrevStudyInfo(book: string, unit: number) {
  // 이전 unit 찾기
  for (const level of Object.values(curriculum.curriculum)) {
    if (!level[book]) continue
    const units = Object.keys(level[book]).map(Number).sort((a, b) => a - b)
    const idx = units.indexOf(unit)
    if (idx > 0) {
      const prevUnit = units[idx - 1]
      return level[book][String(prevUnit)]
    }
  }
  return null
}

function getSystemPrompt() {
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  const dateStr = `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${days[kst.getUTCDay()]}`
  const hours = kst.getUTCHours()
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0')
  const ampm = hours < 12 ? '오전' : '오후'
  const h12 = hours % 12 || 12
  const timeStr = `${ampm} ${h12}:${minutes} (KST)`

  return `You are an enthusiastic and encouraging English teacher for Korean students. Your name is "Coty" (코티 선생님).
Current date and time: ${dateStr} ${timeStr}
Guidelines:
- Keep responses SHORT (1-3 sentences max) for natural conversation flow
- Use simple, clear English appropriate for intermediate learners
- Be warm, encouraging, and positive
- If the student speaks in Korean, understand their meaning and respond in English only
- If the student makes a grammar mistake, gently correct it naturally in your response
- Ask follow-up questions to keep the conversation going
- Always respond in English only, regardless of what language the student uses
- You know the current date and time — use it naturally when relevant`
}

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const { messages, studentText, withTranslation, currentBook, currentUnit } = await req.json()

    if (!studentText) {
      return NextResponse.json({ error: 'studentText is required' }, { status: 400 })
    }

    // ── 인사말 ──────────────────────────────────────────
    if (studentText.startsWith('__GREETING__:')) {
      const nickname = studentText.replace('__GREETING__:', '').trim()
      const unitData = currentBook && currentUnit ? getUnitData(currentBook, currentUnit) : null
      const prevData = currentBook && currentUnit ? getPrevStudyInfo(currentBook, currentUnit) : null

      const now = new Date()
      const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
      const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const months = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December']
      const dayName = days[kst.getUTCDay()]
      const monthName = months[kst.getUTCMonth()]
      const date = kst.getUTCDate()
      const hours = kst.getUTCHours()
      const greeting = hours < 12 ? 'Good morning' : hours < 18 ? 'Good afternoon' : 'Good evening'

      const greetingPrompt = `You are Coty, a warm and enthusiastic English teacher for Korean students.
Today is ${dayName}, ${monthName} ${date}.

Generate a natural greeting and lesson introduction for ${nickname} following this EXACT sequence:
1. Greet with their name and today's day/date (1 sentence)
2. Ask about the weather today (1 sentence)  
3. ${prevData ? `Brief review mention: "Last time we studied '${prevData.title || ''}' with words like ${prevData.words.split(',').slice(0,3).join(', ')}. Do you remember?" (1-2 sentences)` : 'Skip review (first lesson)'}
4. Announce today's lesson: "${currentBook ? `Today we're going to study ${currentBook}${unitData ? `, Unit ${currentUnit} - '${unitData.title || ''}'` : ''}!` : 'Let\'s practice English today!'}" (1 sentence)
5. ${unitData ? `Introduce 2-3 key words from: ${unitData.words.split(',').slice(0,5).join(', ')} (1 sentence)` : ''}
6. Encourage them to start speaking (1 sentence)

Keep it natural, warm, and under 6 sentences total. Never use Korean.`

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: greetingPrompt },
          { role: 'user', content: `Generate the greeting for ${nickname}.` },
        ],
        max_tokens: 200,
        temperature: 0.8,
      })
      const greetingText = response.choices[0]?.message?.content ||
        `${greeting}, ${nickname}! How's the weather today? Let's practice English!`
      return NextResponse.json({
        text: greetingText,
        unitTitle: unitData?.title || '',
        role: 'assistant'
      })
    }

    // ── 인식 불명확 되묻기 ──────────────────────────────
    if (studentText.startsWith('__CLARIFY__:')) {
      const partialText = studentText.replace('__CLARIFY__:', '').trim()
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are Coty, an English teacher. Ask the student to clarify naturally in 1 sentence. Reference what you heard if possible. Be warm. Never use Korean.`,
          },
          { role: 'user', content: `I partially heard: "${partialText}". Ask to clarify.` },
        ],
        max_tokens: 60,
        temperature: 0.7,
      })
      return NextResponse.json({
        text: response.choices[0]?.message?.content || "Sorry, I didn't catch that. Could you say it again?",
        role: 'assistant'
      })
    }

    // ── 일반 대화 ────────────────────────────────────────
    // 교재 컨텍스트를 시스템 프롬프트에 추가
    let curriculumContext = ''
    if (currentBook && currentUnit) {
      const unitData = getUnitData(currentBook, currentUnit)
      if (unitData) {
        curriculumContext = `
Current lesson: ${currentBook}, Unit ${currentUnit}${unitData.title ? ` - "${unitData.title}"` : ''}
Target words: ${unitData.words}
Objectives: ${unitData.objectives}
${unitData.sentence_patterns ? `Key sentence patterns: ${unitData.sentence_patterns}` : ''}
${unitData.grammar ? `Grammar focus: ${unitData.grammar}` : ''}

Guide the student to naturally use these words and sentence patterns. Gently encourage usage of target vocabulary when appropriate.`
      }
    }

    const systemPrompt = getSystemPrompt() + curriculumContext

    const conversationMessages = [
      { role: 'system' as const, content: systemPrompt },
      ...(messages || []),
      { role: 'user' as const, content: studentText },
    ]

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: conversationMessages,
      max_tokens: 150,
      temperature: 0.8,
    })

    const aiText = response.choices[0]?.message?.content || ''

    if (withTranslation && aiText) {
      const translationRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '다음 영어 문장을 자연스러운 한국어로 번역해줘. 번역문만 출력하고 다른 말은 하지 마.' },
          { role: 'user', content: aiText },
        ],
        max_tokens: 150,
        temperature: 0.3,
      })
      return NextResponse.json({
        text: aiText,
        translation: translationRes.choices[0]?.message?.content || '',
        role: 'assistant'
      })
    }

    return NextResponse.json({ text: aiText, role: 'assistant' })

  } catch (error) {
    console.error('GPT API 오류:', error)
    return NextResponse.json({ error: 'GPT API 오류' }, { status: 500 })
  }
}
