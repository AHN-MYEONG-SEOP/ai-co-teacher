import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { email, password, name, nickname, class_id: classId } = await req.json()

    if (!email || !password || !name) {
      return NextResponse.json({ error: '이메일, 비밀번호, 이름은 필수입니다.' }, { status: 400 })
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (authError) throw authError

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        role: 'student',
        name,
        nickname: nickname || name,  // nickname 없으면 name 사용
        class_id: classId || null,   // 반 미선택 시 미배정
      })

    if (profileError) throw profileError

    return NextResponse.json({ success: true, userId: authData.user.id })
  } catch (error) {
    console.error('학생 계정 생성 오류:', error)
    return NextResponse.json({ error: '학생 계정 생성 실패' }, { status: 500 })
  }
}
