import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { session_id, student_id, role, content, stt_path, confidence, latency_ms } = await req.json()

    const { error } = await supabase
      .from('conversation_logs')
      .insert({
        session_id,
        student_id,
        role,
        content,
        stt_path: stt_path || null,
        confidence: confidence || null,
        latency_ms: latency_ms || null,
      })

    if (error) {
      console.error('Supabase 저장 오류:', error)
      // 저장 실패해도 대화는 계속 진행
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Log API 오류:', error)
    return NextResponse.json({ error: 'Log API 오류' }, { status: 500 })
  }
}
