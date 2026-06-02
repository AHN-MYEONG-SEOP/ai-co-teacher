import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { kstToday, toBookSlug, progressRate } from '@/lib/lesson'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

interface ProgressRow {
  id?: string
  student_id: string
  scenario_id: string
  session_date: string
  current_step: number
  completed_steps: number[]
  natural_steps: number[]
  hint_used_steps: number[]
  completed: boolean
  completed_at?: string | null
}

// ── 오늘 수업 시나리오(템플릿) + 진도 로드 ───────────────
// GET /api/lesson-scenario?student_id=&book_slug=&unit=
// book_slug 없이 book 으로 줘도 변환해서 조회
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(req.url)
    const studentId = searchParams.get('student_id')
    const unit = Number(searchParams.get('unit') || '1')
    const bookSlug = searchParams.get('book_slug')
      || (searchParams.get('book') ? toBookSlug(searchParams.get('book')!) : null)

    if (!bookSlug || !unit) {
      return NextResponse.json({ scenario: null, progress: null })
    }

    // 1) 공용 시나리오 템플릿 조회
    const { data: scenario } = await supabase
      .from('lesson_scenarios')
      .select('*')
      .eq('book_slug', bookSlug)
      .eq('unit', unit)
      .eq('is_active', true)
      .maybeSingle()

    if (!scenario) {
      return NextResponse.json({ scenario: null, progress: null })
    }

    // 2) 오늘 진도 로드 (없으면 생성)
    let progress: ProgressRow | null = null
    if (studentId) {
      const today = kstToday()
      const { data: existing } = await supabase
        .from('lesson_progress')
        .select('*')
        .eq('student_id', studentId)
        .eq('scenario_id', scenario.id)
        .eq('session_date', today)
        .maybeSingle()

      if (existing) {
        progress = existing as ProgressRow
      } else {
        const fresh: ProgressRow = {
          student_id: studentId,
          scenario_id: scenario.id,
          session_date: today,
          current_step: 1,
          completed_steps: [],
          natural_steps: [],
          hint_used_steps: [],
          completed: false,
        }
        const { data: inserted } = await supabase
          .from('lesson_progress')
          .insert(fresh)
          .select('*')
          .single()
        progress = (inserted as ProgressRow) ?? fresh
      }
    }

    const rate = progress
      ? progressRate(progress.natural_steps || [], scenario.total_steps)
      : 0

    return NextResponse.json({
      scenario,
      progress: progress ? { ...progress, progress_rate: rate } : null,
    })
  } catch (error) {
    console.error('lesson-scenario 조회 오류:', error)
    return NextResponse.json({ scenario: null, progress: null }, { status: 500 })
  }
}
