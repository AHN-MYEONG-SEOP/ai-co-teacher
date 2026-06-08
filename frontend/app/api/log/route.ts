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
      grammar, overall, retry_reason,
      hint_used, log_id,
      session_type, classroom_session_id, target_student_id,
      step_type, is_correct, score, feedback_kr,
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
          overall: overall || null,
          retry_reason: retry_reason || null,
          hint_used: hint_used ?? false,
          session_type: session_type || null,
          classroom_session_id: classroom_session_id || null,
          target_student_id: target_student_id || null,
          step_type: step_type || null,
          is_correct: is_correct ?? null,
          score: score ?? null,
          feedback_kr: feedback_kr || null,
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
