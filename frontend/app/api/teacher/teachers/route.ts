import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── GET: 교사 목록 (담임 반 수 포함) ──
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const { data: teachers, error } = await supabase
      .from('profiles')
      .select('id, name, nickname')
      .eq('role', 'teacher')
      .order('name')
    if (error) throw error

    const { data: classes } = await supabase.from('classes').select('id, teacher_id')
    const countByTeacher = new Map<string, number>()
    for (const c of (classes ?? []) as { teacher_id: string | null }[]) {
      if (c.teacher_id) countByTeacher.set(c.teacher_id, (countByTeacher.get(c.teacher_id) ?? 0) + 1)
    }

    const result = (teachers ?? []).map(t => ({
      id: t.id as string,
      name: t.name as string,
      nickname: (t.nickname as string | null) ?? null,
      class_count: countByTeacher.get(t.id as string) ?? 0,
    }))
    return NextResponse.json({ teachers: result })
  } catch (error) {
    console.error('교사 목록 조회 오류:', error)
    return NextResponse.json({ error: '교사 조회 실패' }, { status: 500 })
  }
}

// ── POST: 교사 계정 생성. { email, password, name, nickname? } ──
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const { email, password, name, nickname } = await req.json()
    if (!email || !password || !name) {
      return NextResponse.json({ error: '이메일, 비밀번호, 이름은 필수입니다.' }, { status: 400 })
    }

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (authError) throw authError

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        role: 'teacher',
        name,
        nickname: nickname || name,
      })
    if (profileError) throw profileError

    return NextResponse.json({ success: true, teacherId: authData.user.id })
  } catch (error) {
    console.error('교사 계정 생성 오류:', error)
    const message = error instanceof Error ? error.message : '교사 계정 생성 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── DELETE: ?id= 교사 삭제 (담임 반이 있으면 차단) ──
export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

    const { count } = await supabase
      .from('classes')
      .select('id', { count: 'exact', head: true })
      .eq('teacher_id', id)
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: '이 교사가 담임인 반이 있습니다. 먼저 반의 담임을 변경한 뒤 삭제하세요.' },
        { status: 409 }
      )
    }

    await supabase.from('profiles').delete().eq('id', id)
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('교사 삭제 오류:', error)
    return NextResponse.json({ error: '교사 삭제 실패' }, { status: 500 })
  }
}
