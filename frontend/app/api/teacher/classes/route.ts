import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface StudentLite {
  id: string
  name: string
  nickname: string | null
  class_id: string | null
}

// ── GET: 전체 반 목록(담임 교사 + 소속 학생) + 미배정 학생 풀 ──
// 관리 화면용이라 모든 반을 반환(담임을 임의 교사로 지정 가능). 대시보드의
// '본인 반 학생' 필터링은 page.tsx가 별도 쿼리로 수행하므로 영향 없음.
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()

    const { data: classes, error: cErr } = await supabase
      .from('classes')
      .select('id, name, teacher_id')
      .order('name')
    if (cErr) throw cErr

    const { data: students, error: sErr } = await supabase
      .from('profiles')
      .select('id, name, nickname, class_id, role')
      .order('name')
    if (sErr) throw sErr

    const rows = (students ?? []) as (StudentLite & { role: string })[]
    const studentRows = rows.filter(s => s.role === 'student')
    // 교사 id → 이름 (담임 표기용)
    const teacherName = new Map<string, string>()
    for (const t of rows) if (t.role === 'teacher') teacherName.set(t.id, t.name)

    const grouped = (classes ?? []).map(c => ({
      id: c.id as string,
      name: c.name as string,
      teacher_id: (c.teacher_id as string | null) ?? null,
      teacher_name: c.teacher_id ? teacherName.get(c.teacher_id as string) ?? null : null,
      students: studentRows
        .filter(s => s.class_id === c.id)
        .map(({ id, name, nickname, class_id }) => ({ id, name, nickname, class_id })),
    }))
    // 미배정 = class_id 없음 (어떤 반에도 속하지 않은 공용 풀)
    const unassigned = studentRows
      .filter(s => !s.class_id)
      .map(({ id, name, nickname, class_id }) => ({ id, name, nickname, class_id }))

    return NextResponse.json({ classes: grouped, unassigned })
  } catch (error) {
    console.error('반 목록 조회 오류:', error)
    return NextResponse.json({ error: '반 조회 실패' }, { status: 500 })
  }
}

// ── POST: 반 생성/수정(이름·담임). { name, teacher_id, id? } ──
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const { id, teacher_id: teacherId, name } = await req.json() as {
      id?: string; teacher_id?: string | null; name?: string
    }
    if (!name?.trim()) return NextResponse.json({ error: '반 이름은 필수입니다.' }, { status: 400 })

    if (id) {
      // 수정: 이름 + (전달된 경우) 담임 교사
      const patch: { name: string; teacher_id?: string | null } = { name: name.trim() }
      if (teacherId !== undefined) patch.teacher_id = teacherId || null
      const { data, error } = await supabase
        .from('classes')
        .update(patch)
        .eq('id', id)
        .select('id, name, teacher_id')
        .single()
      if (error) throw error
      return NextResponse.json({ class: data })
    }

    if (!teacherId) return NextResponse.json({ error: '담임 교사를 선택하세요.' }, { status: 400 })
    const { data, error } = await supabase
      .from('classes')
      .insert({ teacher_id: teacherId, name: name.trim() })
      .select('id, name, teacher_id')
      .single()
    if (error) throw error
    return NextResponse.json({ class: data })
  } catch (error) {
    console.error('반 저장 오류:', error)
    const message = error instanceof Error ? error.message : '반 저장 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── DELETE: ?id= 반 삭제 (소속 학생은 미배정으로 되돌림) ──
export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

    // FK 위반 방지 — 참조하는 행들의 class_id 먼저 해제
    await supabase.from('profiles').update({ class_id: null }).eq('class_id', id)
    await supabase.from('sessions').update({ class_id: null }).eq('class_id', id)

    const { error } = await supabase.from('classes').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('반 삭제 오류:', error)
    return NextResponse.json({ error: '반 삭제 실패' }, { status: 500 })
  }
}
