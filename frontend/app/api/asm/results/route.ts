import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
export const dynamic = 'force-dynamic'

const SYSTEM_PROMPT = `You are an English speaking assessment evaluator for Korean elementary/middle school students.

Evaluate based on 4 criteria (0-100 each):

1. Pronunciation: Based on Deepgram word confidence scores
   - 100: All words confidence > 0.9
   - Deduct 10 per word with confidence < 0.7

2. Completeness: Compare target vs spoken words
   - 100: All target words spoken
   - Deduct 20 per missing key word

3. Pacing: WPM = word_count / duration * 60
   - 100: 80-140 WPM
   - 70: 60-80 or 140-180 WPM  
   - 40: outside those ranges

4. Pausing: Gaps between words
   - 100: all gaps < 0.4s
   - Deduct 10 per gap 0.4-0.8s
   - Deduct 20 per gap > 0.8s

Return JSON only:
{
  "pronunciation": 0-100,
  "completeness": 0-100,
  "pacing": 0-100,
  "pausing": 0-100,
  "step_total": average of above 4,
  "feedback_kr": "한국어 피드백 한 줄"
}`

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const { session_id, scenario_id, student_id, step, target, spoken, words } = await req.json()

    if (!session_id || !student_id) {
      return NextResponse.json({ error: 'session_id, student_id 필요' }, { status: 400 })
    }

    // GPT 채점
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify({ target, spoken, words }) }
      ]
    })

    const raw = response.choices[0].message.content || '{}'
    const score = JSON.parse(raw)

    // result_key 생성
    const result_key = session_id + '-' + student_id + '-step' + step

    // DB 저장
    const { data, error } = await supabase
      .from('asm_results')
      .upsert({
        result_key,
        session_id,
        scenario_id: scenario_id || null,
        student_id,
        step,
        target,
        spoken,
        words,
        pronunciation: Math.round(score.pronunciation || 0),
        completeness: Math.round(score.completeness || 0),
        pacing: Math.round(score.pacing || 0),
        pausing: Math.round(score.pausing || 0),
        step_total: Math.round(score.step_total || 0),
        feedback_kr: score.feedback_kr || '',
      }, { onConflict: 'result_key' })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ result: data, score })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { searchParams } = new URL(req.url)
    const session_id = searchParams.get('session_id')
    if (!session_id) return NextResponse.json({ error: 'session_id 필요' }, { status: 400 })

    const { data, error } = await supabase
      .from('asm_results')
      .select('*')
      .eq('session_id', session_id)
      .order('created_at', { ascending: true })

    if (error) throw error
    return NextResponse.json({ results: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
