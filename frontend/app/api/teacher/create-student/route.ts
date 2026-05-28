import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    // Service Role Key로 관리자 클라이언트 생성
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { email, password, name } = await req.json()

    if (!email || !password || !name) {
      return NextResponse.json({ error: '이메일, 비밀번호, 이름은 필수입니다.' }, { status: 400 })
    }

    // Supabase Auth에 학생 계정 생성
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // 이메일 인증 없이 바로 활성화
    })

    if (authError) throw authError

    // profiles 테이블에 학생 정보 저장
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: authData.user.id,
        role: 'student',
        name,
      })

    if (profileError) throw profileError

    return NextResponse.json({ success: true, userId: authData.user.id })
  } catch (error) {
    console.error('학생 계정 생성 오류:', error)
    return NextResponse.json({ error: '학생 계정 생성 실패' }, { status: 500 })
  }
}
