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
  attempt: number
  current_step: number
  completed_steps: number[]
  natural_steps: number[]
  hint_used_steps: number[]
  completed: boolean
  completed_at?: string | null
}

// 회차 통계 — 해당 (학생·시나리오) 전체 기간 누적
async function attemptStats(
  supabase: ReturnType<typeof getSupabase>,
  studentId: string,
  scenarioId: string
): Promise<{ attempt_count: number; completed_count: number; max_attempt: number }> {
  const { data } = await supabase
    .from('lesson_progress')
    .select('attempt, completed')
    .eq('student_id', studentId)
    .eq('scenario_id', scenarioId)
  const rows = (data as { attempt: number; completed: boolean }[] | null) ?? []
  const completed_count = rows.filter(r => r.completed).length
  const max_attempt = rows.reduce((m, r) => Math.max(m, r.attempt || 0), 0)
  return { attempt_count: rows.length, completed_count, max_attempt }
}

// ── GET: 오늘 수업 시나리오(템플릿) + 회차 통계 로드 (행 생성 안 함) ──
// GET /api/lesson-scenario?student_id=&book_slug=&unit=[&progress_id=]
// progress_id 주면 그 회차 행을 resume 으로 반환 (새로고침 시 이어하기)
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(req.url)
    const studentId = searchParams.get('student_id')
    const progressId = searchParams.get('progress_id')
    const unit = Number(searchParams.get('unit') || '1')
    const bookSlug = searchParams.get('book_slug')
      || (searchParams.get('book') ? toBookSlug(searchParams.get('book')!) : null)

    if (!bookSlug || !unit) {
      return NextResponse.json({ scenario: null, attempt_count: 0, completed_count: 0, resume: null })
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
      return NextResponse.json({ scenario: null, attempt_count: 0, completed_count: 0, resume: null })
    }

    // 2) 회차 통계 + (요청 시) 이어할 회차 행
    let attempt_count = 0
    let completed_count = 0
    let resume: (ProgressRow & { progress_rate: number }) | null = null
    if (studentId) {
      const stats = await attemptStats(supabase, studentId, scenario.id)
      attempt_count = stats.attempt_count
      completed_count = stats.completed_count

      if (progressId) {
        const { data: row } = await supabase
          .from('lesson_progress')
          .select('*')
          .eq('id', progressId)
          .eq('student_id', studentId)
          .maybeSingle()
        if (row) {
          const r = row as ProgressRow
          resume = { ...r, progress_rate: progressRate(r.natural_steps || [], scenario.total_steps) }
        }
      }
    }

    return NextResponse.json({ scenario, attempt_count, completed_count, resume })
  } catch (error) {
    console.error('lesson-scenario 조회 오류:', error)
    return NextResponse.json({ scenario: null, attempt_count: 0, completed_count: 0, resume: null }, { status: 500 })
  }
}

// ── POST: 새 회차 시작 (진도율 0부터, 기존 회차는 누적 보존) ──
// POST /api/lesson-scenario  { action:'start', student_id, book_slug, unit }
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await req.json()
    const { action, student_id: studentId, unit } = body as {
      action?: string; student_id?: string; unit?: number
    }
    const bookSlug = body.book_slug || (body.book ? toBookSlug(body.book) : null)

    if (action !== 'start') {
      return NextResponse.json({ error: 'unknown action' }, { status: 400 })
    }
    if (!bookSlug || !unit) {
      return NextResponse.json({ scenario: null, progress: null, attempt_number: 0, completed_count: 0 })
    }

    const { data: scenario } = await supabase
      .from('lesson_scenarios')
      .select('*')
      .eq('book_slug', bookSlug)
      .eq('unit', unit)
      .eq('is_active', true)
      .maybeSingle()

    // 템플릿 없음 → 자유 대화 폴백 (진도 추적 없음)
    if (!scenario) {
      return NextResponse.json({ scenario: null, progress: null, attempt_number: 0, completed_count: 0 })
    }

    // studentId 없으면 시나리오만 반환 (진도 행 생성 불가)
    if (!studentId) {
      return NextResponse.json({ scenario, progress: null, attempt_number: 1, completed_count: 0 })
    }

    const stats = await attemptStats(supabase, studentId, scenario.id)
    const attemptNumber = stats.max_attempt + 1

    const fresh: ProgressRow = {
      student_id: studentId,
      scenario_id: scenario.id,
      session_date: kstToday(),
      attempt: attemptNumber,
      current_step: 1,
      completed_steps: [],
      natural_steps: [],
      hint_used_steps: [],
      completed: false,
    }
    const { data: inserted, error } = await supabase
      .from('lesson_progress')
      .insert(fresh)
      .select('*')
      .single()
    if (error) {
      console.error('lesson_progress 회차 생성 실패:', error)
      return NextResponse.json({ scenario, progress: null, attempt_number: attemptNumber, completed_count: stats.completed_count }, { status: 500 })
    }

    const row = inserted as ProgressRow
    return NextResponse.json({
      scenario,
      progress: { ...row, progress_rate: 0 },
      attempt_number: attemptNumber,
      completed_count: stats.completed_count,
    })
  } catch (error) {
    console.error('lesson-scenario 회차 시작 오류:', error)
    return NextResponse.json({ scenario: null, progress: null, attempt_number: 0, completed_count: 0 }, { status: 500 })
  }
}
