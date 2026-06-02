import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kstToday } from '@/lib/lesson'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// 로그아웃 시 오늘 진도 + 리포트 초기화
// POST /api/reset-progress  { student_id }
// - lesson_progress: 오늘자(KST) 행 삭제 → 다음 로그인 시 0%부터 새 수업
// - lesson_reports: 오늘자 리포트 삭제 (KST/UTC 모두 커버)
export async function POST(req: NextRequest) {
  try {
    const { student_id } = await req.json()
    if (!student_id) {
      return NextResponse.json({ error: 'student_id required' }, { status: 400 })
    }

    const supabase = getSupabase()
    const kst = kstToday()
    const utc = new Date().toISOString().slice(0, 10)
    // lesson_progress는 KST, lesson_reports는 UTC 기준으로 저장되므로 둘 다 삭제 대상에 포함
    const dates = Array.from(new Set([kst, utc]))

    const [progressRes, reportRes] = await Promise.all([
      supabase
        .from('lesson_progress')
        .delete()
        .eq('student_id', student_id)
        .in('session_date', dates),
      supabase
        .from('lesson_reports')
        .delete()
        .eq('student_id', student_id)
        .in('studied_at', dates),
    ])

    if (progressRes.error) console.error('lesson_progress 삭제 오류:', progressRes.error)
    if (reportRes.error) console.error('lesson_reports 삭제 오류:', reportRes.error)

    return NextResponse.json({
      ok: !progressRes.error && !reportRes.error,
      cleared_dates: dates,
    })
  } catch (error) {
    console.error('reset-progress 오류:', error)
    return NextResponse.json({ error: 'reset 실패' }, { status: 500 })
  }
}
