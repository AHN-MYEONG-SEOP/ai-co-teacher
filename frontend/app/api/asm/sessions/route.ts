import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { session_key, session_date, session_time } = await req.json()
    if (!session_key) return NextResponse.json({ error: 'session_key 필요' }, { status: 400 })

    // 기존 세션 조회
    const { data: existing } = await supabase
      .from('asm_sessions')
      .select('*')
      .eq('session_key', session_key)
      .single()

    if (existing) {
      return NextResponse.json({ session: existing, created: false })
    }

    // 새 세션 생성
    const { data, error } = await supabase
      .from('asm_sessions')
      .insert({
        session_key,
        session_date,
        session_time,
        title: session_date + ' ' + session_time + ' 수업',
        status: 'ready',
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ session: data, created: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data, error } = await supabase
      .from('asm_sessions')
      .select('*')
      .order('session_date', { ascending: false })
      .order('session_time', { ascending: false })
    if (error) throw error
    return NextResponse.json({ sessions: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
