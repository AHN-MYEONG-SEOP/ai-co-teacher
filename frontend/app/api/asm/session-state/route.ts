import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { searchParams } = new URL(req.url)
    const session_id = searchParams.get('session_id')
    if (!session_id) return NextResponse.json({ error: 'session_id 필요' }, { status: 400 })

    // 세션 조회
    const { data: sess, error } = await supabase
      .from('asm_sessions')
      .select('*')
      .eq('id', session_id)
      .single()
    if (error || !sess) return NextResponse.json({ error: '세션 없음' }, { status: 404 })

    if (sess.status === 'ended') return NextResponse.json({ status: 'ended' })

    if (!sess.current_student_id || !sess.current_scenario_id) {
      return NextResponse.json({ status: 'waiting' })
    }

    // 학생 + 시나리오 조회
    const [{ data: student }, { data: scenario }] = await Promise.all([
      supabase.from('profiles').select('id, name, nickname').eq('id', sess.current_student_id).single(),
      supabase.from('asm_scenarios').select('*').eq('id', sess.current_scenario_id).single(),
    ])

    if (!student || !scenario) return NextResponse.json({ status: 'waiting' })

    return NextResponse.json({
      status: 'active',
      session_id: sess.id,
      current_step: sess.current_step || 1,
      student: { id: student.id, name: student.name, nickname: student.nickname },
      scenario: { id: scenario.id, steps: scenario.steps, total_steps: scenario.total_steps }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
