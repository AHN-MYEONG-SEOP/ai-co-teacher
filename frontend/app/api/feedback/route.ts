import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const { text } = await req.json()

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `You are an English teacher evaluating a student's spoken English.
Analyze the given text and respond ONLY with a JSON object (no markdown, no backticks):
{
  "grammar": <score 0-100>,
  "fluency": <score 0-100>,
  "vocabulary": <score 0-100>,
  "overall": <score 0-100>,
  "correction": "<corrected version if needed, or null>",
  "tip": "<one short encouraging tip in English>"
}`
        },
        { role: 'user', content: `Evaluate this student's spoken English: "${text}"` }
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
