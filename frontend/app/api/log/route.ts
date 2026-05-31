import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const {
      session_id, student_id,
      student_text, ai_text,
      stt_path, confidence, latency_ms,
      grammar, fluency, vocabulary, overall, correction, tip,
      hint_used,
      log_id,
    } = await req.json()

    if (log_id) {
      const { error } = await supabase
        .from('conversation_logs')
        .update({ ai_text })
        .eq('id', log_id)

      if (error) {
        console.error('Supabase 업데이트 오류:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true })

    } else {
      const { data, error } = await supabase
        .from('conversation_logs')
        .insert({
          session_id: session_id || null,
          student_id: student_id || null,
          student_text: student_text || null,
          ai_text: ai_text || null,
          stt_path: stt_path || null,
          confidence: confidence || null,
          latency_ms: latency_ms || null,
          grammar: grammar || null,
          fluency: fluency || null,
          vocabulary: vocabulary || null,
          overall: overall || null,
          correction: correction || null,
          tip: tip || null,
          hint_used: hint_used ?? false,
        })
        .select('id')
        .single()

      if (error) {
        console.error('Supabase 저장 오류:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ success: true, log_id: data.id })
    }

  } catch (error) {
    console.error('Log API 오류:', error)
    return NextResponse.json({ error: 'Log API 오류' }, { status: 500 })
  }
}
