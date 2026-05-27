import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `You are an enthusiastic and encouraging English teacher for Korean students.
Your role is to help students practice conversational English.

Guidelines:
- Keep responses SHORT (1-3 sentences max) for natural conversation flow
- Use simple, clear English appropriate for intermediate learners
- Be warm, encouraging, and positive
- If the student makes a grammar mistake, gently correct it naturally in your response
- Ask follow-up questions to keep the conversation going
- Never use Korean in your responses`

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const { messages, studentText } = await req.json()

    if (!studentText) {
      return NextResponse.json({ error: 'studentText is required' }, { status: 400 })
    }

    const conversationMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
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

    return NextResponse.json({ text: aiText, role: 'assistant' })
  } catch (error) {
    console.error('GPT API 오류:', error)
    return NextResponse.json({ error: 'GPT API 오류' }, { status: 500 })
  }
}
