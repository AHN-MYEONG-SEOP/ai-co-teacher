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
          content: `You are an English pronunciation coach for Korean students.
Use the conversation context to understand what the student meant to say.
Respond ONLY with a JSON object (no markdown, no backticks):
{
  "grammar": <score 0-100>,
  "fluency": <score 0-100>,
  "vocabulary": <score 0-100>,
  "overall": <score 0-100>,
  "correction": "<corrected version considering context, or null if correct>",
  "tip": "<pronunciation tip in Korean comparing what they said vs what they should say. If correction exists, focus on the mispronounced word(s) — explain the difference in pronunciation between the student's word and the correct word, using simple Korean explanations like 'park[pɑːrk]는 끝에 k 소리가 나요, part[pɑːrt]와 달리'. If no correction, give a short encouraging pronunciation tip in Korean.>"
}`
        },
        { role: 'user', content: contextText }
      ],
      max_tokens: 300,
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
