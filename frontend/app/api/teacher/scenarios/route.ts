import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { toBookSlug } from '@/lib/lesson'

export const dynamic = 'force-dynamic'

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface ScenarioStep {
  step: number
  target_word?: string
  scene_kr?: string
  ai_line?: string
  expected_pattern?: string
  accept_variants?: string[]
  hint_line?: string
  reaction?: string
}
interface ScenarioPhase {
  phase: number
  label?: string
  description?: string
  steps: ScenarioStep[]
}
interface ScenarioPayload {
  id?: string
  book: string
  unit: number
  title?: string | null
  target_words?: string[]
  target_patterns?: string[]
  phases?: ScenarioPhase[]
  closing?: unknown
  gpt_rules?: unknown
  is_active?: boolean
}

// ── GET: 시나리오 목록 (경량) 또는 ?id= 단일 전체 행 ──
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (id) {
      const { data, error } = await supabase
        .from('lesson_scenarios')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return NextResponse.json({ scenario: data })
    }

    const { data, error } = await supabase
      .from('lesson_scenarios')
      .select('id, book, book_slug, unit, title, total_steps, is_active, updated_at')
      .order('book')
      .order('unit')
    if (error) throw error
    return NextResponse.json({ scenarios: data ?? [] })
  } catch (error) {
    console.error('시나리오 목록/조회 오류:', error)
    return NextResponse.json({ error: '시나리오 조회 실패' }, { status: 500 })
  }
}

// ── POST: 시나리오 생성/수정 (upsert). id 있으면 update, 없으면 insert ──
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const body = (await req.json()) as ScenarioPayload

    if (!body.book?.trim() || !body.unit) {
      return NextResponse.json({ error: '교재명과 Unit은 필수입니다.' }, { status: 400 })
    }

    const phases = Array.isArray(body.phases) ? body.phases : []
    // total_steps 는 phases 의 step 수에서 자동 산정 (진도율 산정 기준과 일치시킴)
    const totalSteps = phases.reduce((sum, p) => sum + (Array.isArray(p.steps) ? p.steps.length : 0), 0)

    const row = {
      book: body.book.trim(),
      book_slug: toBookSlug(body.book),
      unit: body.unit,
      title: body.title ?? null,
      target_words: body.target_words ?? [],
      target_patterns: body.target_patterns ?? [],
      total_steps: totalSteps,
      phases,
      closing: body.closing ?? null,
      gpt_rules: body.gpt_rules ?? null,
      is_active: body.is_active ?? true,
      updated_at: new Date().toISOString(),
    }

    if (body.id) {
      const { data, error } = await supabase
        .from('lesson_scenarios')
        .update(row)
        .eq('id', body.id)
        .select('*')
        .single()
      if (error) throw error
      return NextResponse.json({ scenario: data })
    }

    const { data, error } = await supabase
      .from('lesson_scenarios')
      .insert(row)
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ scenario: data })
  } catch (error) {
    console.error('시나리오 저장 오류:', error)
    const message = error instanceof Error ? error.message : '시나리오 저장 실패'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── DELETE: ?id= 시나리오 삭제 ──
export async function DELETE(req: NextRequest) {
  try {
    const supabase = getSupabaseAdmin()
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

    const { error } = await supabase.from('lesson_scenarios').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('시나리오 삭제 오류:', error)
    return NextResponse.json({ error: '시나리오 삭제 실패' }, { status: 500 })
  }
}
