import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { session_id } = await req.json()
    if (!session_id) return NextResponse.json({ error: 'session_id 필요' }, { status: 400 })

    // 1. asm_results 삭제
    await supabase.from('asm_results').delete().eq('session_id', session_id)
    // 2. asm_teacher_scores 삭제
    await supabase.from('asm_teacher_scores').delete().eq('session_id', session_id)
    // 3. asm_student_likes 삭제
    await supabase.from('asm_student_likes').delete().eq('session_id', session_id)
    // 4. 세션 상태 초기화 (ready로, current_student_id null)
    await supabase.from('asm_sessions').update({
      status: 'ready',
      current_student_id: null,
      current_step: 1,
      current_scenario_id: null,
    }).eq('id', session_id)

    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
