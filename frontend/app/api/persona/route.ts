import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// student_personas 의 jsonb 페르소나 항목 (free_facts(text[])는 별도 처리)
const PERSONA_JSONB_FIELDS = [
  'family_members', 'school_life', 'food_preferences', 'hobbies', 'nature',
  'appearance', 'personality', 'daily_life', 'future', 'environment', 'learning_patterns',
] as const

type Json = Record<string, unknown>

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function isPlainObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// 기존 페르소나에 새 정보를 누적 병합 (배열=합집합, 객체=재귀병합, 스칼라=덮어쓰기)
function deepMerge(target: unknown, source: unknown): unknown {
  if (source === undefined || source === null) return target
  if (Array.isArray(target) && Array.isArray(source)) {
    const merged = [...target]
    for (const item of source) {
      if (isPlainObject(item) || Array.isArray(item)) {
        merged.push(item) // 복잡한 항목은 중복 판단이 어려워 그대로 추가
      } else if (!merged.includes(item)) {
        merged.push(item)
      }
    }
    return merged
  }
  if (isPlainObject(target) && isPlainObject(source)) {
    const out: Json = { ...target }
    for (const key of Object.keys(source)) {
      out[key] = key in out ? deepMerge(out[key], source[key]) : source[key]
    }
    return out
  }
  return source
}

// 페르소나 조회
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(req.url)
    const student_id = searchParams.get('student_id')
    if (!student_id) {
      return NextResponse.json({ error: 'student_id 필수' }, { status: 400 })
    }

    const { data } = await supabase
      .from('student_personas')
      .select('*')
      .eq('student_id', student_id)
      .single()

    return NextResponse.json({ persona: data || null })
  } catch (error) {
    console.error('persona 조회 오류:', error)
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}

// 페르소나 업데이트 (기존 데이터에 merge)
export async function POST(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const { student_id, persona_update } = await req.json()

    if (!student_id || !persona_update || typeof persona_update !== 'object') {
      return NextResponse.json({ error: 'student_id, persona_update 필수' }, { status: 400 })
    }

    // 기존 페르소나 로드
    const { data: existing } = await supabase
      .from('student_personas')
      .select('*')
      .eq('student_id', student_id)
      .single()

    const update: Json = {}

    // jsonb 항목 병합
    for (const field of PERSONA_JSONB_FIELDS) {
      const incoming = (persona_update as Json)[field]
      if (incoming === undefined) continue
      const base = existing?.[field] ?? {}
      update[field] = deepMerge(base, incoming)
    }

    // free_facts (text[]) 합집합
    const incomingFacts = (persona_update as Json).free_facts
    if (Array.isArray(incomingFacts)) {
      const base: string[] = Array.isArray(existing?.free_facts) ? existing.free_facts : []
      const merged = [...base]
      for (const f of incomingFacts) {
        if (typeof f === 'string' && f.trim() && !merged.includes(f)) merged.push(f)
      }
      update.free_facts = merged
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ success: true, persona: existing || null, noop: true })
    }

    const { data, error } = await supabase
      .from('student_personas')
      .upsert(
        { student_id, ...update, updated_at: new Date().toISOString() },
        { onConflict: 'student_id' }
      )
      .select('*')
      .single()

    if (error) {
      console.error('persona upsert 오류:', error)
      return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })
    }

    return NextResponse.json({ success: true, persona: data })
  } catch (error) {
    console.error('persona 업데이트 오류:', error)
    return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })
  }
}
