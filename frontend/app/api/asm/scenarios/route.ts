import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('session_id')
    let query = supabase
      .from('asm_scenarios')
      .select('*')
      .order('created_at', { ascending: false })
    if (sessionId) query = query.eq('session_id', sessionId)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ scenarios: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const body = await req.json()
    const { title, book, unit, session_id, class_id, steps, is_active, id } = body

    if (!title?.trim()) return NextResponse.json({ error: '제목을 입력해주세요.' }, { status: 400 })
    if (!steps?.length) return NextResponse.json({ error: 'Step을 추가해주세요.' }, { status: 400 })

    const total_steps = steps.length
    const scenario_key = session_id
      ? session_id + '-' + (class_id || 'noclass') + '-' + Date.now()
      : 'draft-' + Date.now()

    const row = {
      title: title.trim(),
      book: book || '',
      unit: Number(unit) || 1,
      session_id: session_id || null,
      class_id: class_id || null,
      steps,
      total_steps,
      is_active: is_active !== false,
      updated_at: new Date().toISOString(),
    }

    let data, error
    if (id) {
      // 수정
      ;({ data, error } = await supabase
        .from('asm_scenarios')
        .update(row)
        .eq('id', id)
        .select()
        .single())
    } else {
      // 신규
      ;({ data, error } = await supabase
        .from('asm_scenarios')
        .insert({ ...row, scenario_key })
        .select()
        .single())
    }
    if (error) throw error
    return NextResponse.json({ scenario: data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })
    const { error } = await supabase.from('asm_scenarios').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
