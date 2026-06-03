import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// ── POST: 학생을 반에 배정/이동/해제. { student_id, class_id|null } ──
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { student_id: studentId, class_id: classId } = await req.json() as {
      student_id?: string; class_id?: string | null
    }
    if (!studentId) return NextResponse.json({ error: 'student_id가 필요합니다.' }, { status: 400 })

    const { error } = await supabase
      .from('profiles')
      .update({ class_id: classId ?? null })
      .eq('id', studentId)
      .eq('role', 'student')
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('학생 반 배정 오류:', error)
    return NextResponse.json({ error: '반 배정 실패' }, { status: 500 })
  }
}
