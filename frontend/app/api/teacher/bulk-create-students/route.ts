import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { students } = await req.json()

    const { data: classes } = await supabaseAdmin.from('classes').select('id, name')
    const classMap = Object.fromEntries((classes || []).map((c: any) => [c.name, c.id]))

    const results = []
    for (const s of students) {
      const email = s.id.includes('@') ? s.id : s.id + '@sda.ac'
      const password = s.password || 'sda3605'
      const classId = s.className ? classMap[s.className] || null : null
      try {
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email, password, email_confirm: true,
        })
        if (authError) throw authError
        await supabaseAdmin.from('profiles').insert({
          id: authData.user.id,
          role: 'student',
          name: s.name,
          nickname: s.nickname || s.name,
          class_id: classId,
        })
        results.push({ id: s.id, name: s.name, status: 'success' })
      } catch (e: any) {
        results.push({ id: s.id, name: s.name, status: 'fail', error: e.message })
      }
    }
    return NextResponse.json({ results })
  } catch (e) {
    return NextResponse.json({ error: '일괄 등록 실패' }, { status: 500 })
  }
}
