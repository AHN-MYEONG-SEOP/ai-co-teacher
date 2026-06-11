import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { emails } = await req.json()
    const { data: users } = await supabaseAdmin.auth.admin.listUsers()
    const existing = new Set((users?.users || []).map(u => u.email?.toLowerCase()))
    const result = emails.map((email: string) => ({
      email,
      exists: existing.has(email.toLowerCase())
    }))
    return NextResponse.json({ result })
  } catch (e) {
    return NextResponse.json({ error: '확인 실패' }, { status: 500 })
  }
}
