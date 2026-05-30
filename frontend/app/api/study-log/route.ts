import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { student_id, session_id, book, unit, unit_title } = await req.json()

    if (!student_id || !book || !unit) {
      return NextResponse.json({ error: 'student_id, book, unit 필수' }, { status: 400 })
    }

    // 오늘 이미 같은 book/unit 기록이 있으면 중복 저장 안 함
    const today = new Date().toISOString().split('T')[0]
    const { data: existing } = await supabase
      .from('study_logs')
      .select('id')
      .eq('student_id', student_id)
      .eq('book', book)
      .eq('unit', unit)
      .eq('studied_at', today)
      .single()

    if (!existing) {
      await supabase.from('study_logs').insert({
        student_id,
        session_id: session_id || null,
        book,
        unit,
        unit_title: unit_title || null,
        studied_at: today,
      })
    }

    // profiles의 current_book, current_unit 업데이트
    await supabase
      .from('profiles')
      .update({ current_book: book, current_unit: unit })
      .eq('id', student_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('study-log 저장 오류:', error)
    return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  }
}

// 학습 이력 조회
export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    const { searchParams } = new URL(req.url)
    const student_id = searchParams.get('student_id')

    if (!student_id) {
      return NextResponse.json({ error: 'student_id 필수' }, { status: 400 })
    }

    const { data } = await supabase
      .from('study_logs')
      .select('*')
      .eq('student_id', student_id)
      .order('studied_at', { ascending: false })
      .limit(20)

    return NextResponse.json({ logs: data || [] })
  } catch (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}
