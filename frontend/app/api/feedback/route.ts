import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const { text, conversationHistory } = await req.json()

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    // 대화 히스토리를 컨텍스트로 제공해서 문맥 기반 교정
    const contextText = conversationHistory && conversationHistory.length > 0
      ? `Recent conversation context:\n${conversationHistory.slice(-4).map((m: {role: string, content: string}) => `${m.role === 'user' ? 'Student' : 'AI'}: ${m.content}`).join('\n')}\n\nStudent's latest utterance to evaluate: "${text}"`
      : `Evaluate this student's spoken English: "${text}"`

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an English teacher evaluating a Korean student's spoken English.
Use the conversation context to understand what the student meant to say.
Respond ONLY with a JSON object (no markdown, no backticks):
{
  "grammar": <score 0-100>,
  "fluency": <score 0-100>,
  "vocabulary": <score 0-100>,
  "overall": <score 0-100>,
  "correction": "<corrected version considering context, or null if correct>",
  "tip": "<one short encouraging tip in English>"
}`
        },
        { role: 'user', content: contextText }
      ],
      max_tokens: 200,
      temperature: 0.3,
    })

    const raw = response.choices[0]?.message?.content || '{}'
    const feedback = JSON.parse(raw)
    return NextResponse.json(feedback)

  } catch (error) {
    console.error('Feedback API 오류:', error)
    return NextResponse.json({ error: 'Feedback API 오류' }, { status: 500 })
  }
}
