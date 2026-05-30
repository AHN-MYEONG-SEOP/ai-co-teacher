import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'

function getSystemPrompt() {
  // 한국 시간 (KST = UTC+9)
  const now = new Date()
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']
  const dateStr = `${kst.getUTCFullYear()}년 ${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${days[kst.getUTCDay()]}`
  const hours = kst.getUTCHours()
  const minutes = String(kst.getUTCMinutes()).padStart(2, '0')
  const ampm = hours < 12 ? '오전' : '오후'
  const h12 = hours % 12 || 12
  const timeStr = `${ampm} ${h12}:${minutes} (KST)`

  return `You are an enthusiastic and encouraging English teacher for Korean students. Your name is "Coty" (코티 선생님). You are an AI English teacher created specifically for Korean students.
Your role is to help students practice conversational English.

Current date and time: ${dateStr} ${timeStr}

Guidelines:
- Keep responses SHORT (1-3 sentences max) for natural conversation flow
- Use simple, clear English appropriate for intermediate learners
- Be warm, encouraging, and positive
- If the student speaks in Korean, understand their meaning and respond in English only — never respond in Korean
- If the student makes a grammar mistake, gently correct it naturally in your response
- Ask follow-up questions to keep the conversation going
- Always respond in English only, regardless of what language the student uses
- You know the current date and time — use it naturally when relevant`
}

const GREETING_PROMPT = `You are Coty, a warm and enthusiastic English teacher for Korean students.
Generate a friendly greeting for a student. Use their name naturally.
Guidelines:
- Keep it to 2 sentences max
- Be warm and encouraging
- End with a simple question to start the conversation (e.g. about their day, hobbies, or readiness to practice)
- Never use Korean`

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const { messages, studentText, withTranslation } = await req.json()

    if (!studentText) {
      return NextResponse.json({ error: 'studentText is required' }, { status: 400 })
    }

    // 인사말 요청 처리
    if (studentText.startsWith('__GREETING__:')) {
      const nickname = studentText.replace('__GREETING__:', '').trim()
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: GREETING_PROMPT },
          { role: 'user', content: `Generate a greeting for a student named "${nickname}".` },
        ],
        max_tokens: 80,
        temperature: 0.9,
      })
      const greetingText = response.choices[0]?.message?.content || `Hi ${nickname}! Great to see you. Are you ready to practice your English today?`
      return NextResponse.json({ text: greetingText, role: 'assistant' })
    }

    // 인식 불명확 — 부분 텍스트 기반 되묻기
    if (studentText.startsWith('__CLARIFY__:')) {
      const partialText = studentText.replace('__CLARIFY__:', '').trim()
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are Coty, an English teacher. The student said something but it was unclear.
You heard a partial utterance. Ask them to clarify naturally in 1 sentence.
- Reference what you heard if possible
- Be warm and encouraging
- Keep it very short (1 sentence max)
- Never use Korean`,
          },
          { role: 'user', content: `I partially heard: "${partialText}". Ask the student to clarify.` },
        ],
        max_tokens: 60,
        temperature: 0.7,
      })
      const clarifyText = response.choices[0]?.message?.content || "Sorry, I didn't catch that. Could you say it again?"
      return NextResponse.json({ text: clarifyText, role: 'assistant' })
    }

    // 일반 대화 처리
    const conversationMessages = [
      { role: 'system' as const, content: getSystemPrompt() },
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

    // 한국어 번역 요청 시 병렬로 번역
    if (withTranslation && aiText) {
      const translationRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: '다음 영어 문장을 자연스러운 한국어로 번역해줘. 번역문만 출력하고 다른 말은 하지 마.',
          },
          { role: 'user', content: aiText },
        ],
        max_tokens: 150,
        temperature: 0.3,
      })
      const translation = translationRes.choices[0]?.message?.content || ''
      return NextResponse.json({ text: aiText, translation, role: 'assistant' })
    }

    return NextResponse.json({ text: aiText, role: 'assistant' })

  } catch (error) {
    console.error('GPT API 오류:', error)
    return NextResponse.json({ error: 'GPT API 오류' }, { status: 500 })
  }
}
