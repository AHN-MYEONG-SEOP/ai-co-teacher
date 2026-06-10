import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { student_id, name, nickname, email, password } = await req.json()
    if (!student_id || !name) {
      return NextResponse.json({ error: 'student_id, name 필수' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // 1) profiles 테이블 업데이트 (이름/닉네임)
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ name, nickname: nickname || name })
      .eq('id', student_id)
    if (profileError) throw profileError

    // 2) 이메일 변경 (입력된 경우만)
    if (email) {
      const { error: emailError } = await supabase.auth.admin.updateUserById(
        student_id,
        { email }
      )
      if (emailError) throw emailError
    }

    // 3) 비밀번호 변경 (입력된 경우만)
    if (password) {
      const { error: pwError } = await supabase.auth.admin.updateUserById(
        student_id,
        { password }
      )
      if (pwError) throw pwError
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '수정 실패' }, { status: 500 })
  }
}
