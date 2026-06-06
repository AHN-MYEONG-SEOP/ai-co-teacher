import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const { sessionId } = await req.json()
    if (!sessionId) return NextResponse.json({ error: 'sessionId required' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    await supabase
      .from('classroom_sessions')
      .update({ status: 'ended', updated_at: new Date().toISOString() })
      .eq('id', sessionId)

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
