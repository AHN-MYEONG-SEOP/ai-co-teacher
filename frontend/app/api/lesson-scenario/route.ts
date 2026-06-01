import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import curriculumData from '@/data/curriculum.json'

export const dynamic = 'force-dynamic'

const curriculum = curriculumData as {
  level_order: string[]
  curriculum: Record<string, Record<string, Record<string, {
    unit: number; title?: string; words: string
    objectives: string; sentence_patterns?: string; grammar?: string
  }>>>
}

function getUnitData(book: string, unit: number) {
  for (const level of Object.values(curriculum.curriculum)) {
    if (level[book]?.[String(unit)]) return level[book][String(unit)]
  }
  return null
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

interface ScenarioStage {
  type?: string
  target?: string
  pattern_core?: string
  valid_variations?: string[]
  progress_weight?: number
  completion_criteria?: { min_uses?: number; natural_only?: boolean }
}

// 시나리오 stages → 진도 추적용 progress_state 초기 구조
function buildProgressState(scenario: { stages?: ScenarioStage[] }) {
  const rawStages = Array.isArray(scenario?.stages) ? scenario.stages : []
  const stages = rawStages.map((s) => ({
    type: s.type || 'word',
    target: s.target || '',
    pattern_core: s.pattern_core || undefined,
    valid_variations: Array.isArray(s.valid_variations) ? s.valid_variations : undefined,
    weight: typeof s.progress_weight === 'number' ? s.progress_weight : 0,
    min_uses: s.completion_criteria?.min_uses ?? 3,
    current_count: 0,
    completed: false,
    usage_log: [] as string[],
  }))
  // 가중치 정규화 — 합이 0이면 균등 분배, 100이 아니면 비율 유지(클라이언트에서 합산)
  return { progress: 0, stages }
}

// ── 시나리오 생성 ─────────────────────────────────────
async function generateScenario(req: NextRequest) {
  const supabase = getSupabase()
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const { student_id, book, unit } = await req.json()

  if (!student_id || !book || !unit) {
    return NextResponse.json({ error: 'student_id, book, unit 필수' }, { status: 400 })
  }

  // 중복 생성 방지 — 만료되지 않은 ready 시나리오가 같은 book/unit으로 이미 있으면 재사용
  const nowIso = new Date().toISOString()
  const { data: existingReady } = await supabase
    .from('lesson_scenarios')
    .select('*')
    .eq('student_id', student_id)
    .eq('book', book)
    .eq('unit', unit)
    .eq('status', 'ready')
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existingReady) {
    return NextResponse.json({ scenario: existingReady, reused: true })
  }

  const unitData = getUnitData(book, unit)
  if (!unitData) {
    return NextResponse.json({ error: `Unit not found: ${book} U${unit}` }, { status: 404 })
  }

  // 페르소나 로드
  const { data: persona } = await supabase
    .from('student_personas')
    .select('*')
    .eq('student_id', student_id)
    .single()

  // 닉네임 로드
  const { data: profile } = await supabase
    .from('profiles')
    .select('nickname, name')
    .eq('id', student_id)
    .single()
  const nickname = profile?.nickname || profile?.name || 'student'

  const personaText = persona ? JSON.stringify(persona, null, 0) : '{} (no info yet — discover during lesson)'

  const prompt = `You are preparing a personalized English lesson for a Korean elementary student.

Student: ${nickname}
Persona: ${personaText}

Today's lesson: ${book}, Unit ${unit} - "${unitData.title || ''}"
Target words: ${unitData.words}
Objectives: ${unitData.objectives}
Key patterns: ${unitData.sentence_patterns || ''}
Grammar: ${unitData.grammar || ''}

MOST IMPORTANT RULE:
The student must PRODUCE the target language, not just respond.
ALL target words/patterns must come naturally FROM THE STUDENT.

Use these 5 techniques to make the student speak:
1. AI pretends not to know (student explains)
2. AI makes deliberate mistakes (student corrects)
3. Role reversal (student asks questions)
4. Give choices and let student lead
5. AI needs help (student explains)

Use the student's persona (interests, family, etc.) to create situations where today's words naturally come up.

Return JSON ONLY (no markdown, no backticks). Use this exact shape:
{
  "opening": "weather + persona hook to start",
  "bridge": "how to connect the persona topic to today's unit",
  "stages": [
    {
      "type": "word" | "pattern",
      "target": "the word or pattern",
      "pattern_core": "core for patterns (omit for words)",
      "valid_variations": ["accepted variations"],
      "technique": "one of the 5 techniques",
      "setup": "how the AI sets it up",
      "expected_student_output": "what the student should say",
      "progress_weight": <integer, all stages sum to 100>,
      "completion_criteria": { "min_uses": 3, "natural_only": true }
    }
  ],
  "student_initiative_moments": [
    { "timing": "after 3rd exchange", "ai_line": "Now YOU ask ME!", "target_pattern": "..." }
  ],
  "confusion_moments": [
    { "ai_mistake": "...", "target_correction": "...", "target_word": "..." }
  ],
  "closing": "natural way to wrap up"
}

Create one stage per target word AND one per key pattern. Make progress_weight sum to exactly 100.`

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You are an expert ESL lesson designer. Respond with valid JSON only.' },
      { role: 'user', content: prompt },
    ],
    max_tokens: 1500,
    temperature: 0.8,
  })

  const raw = res.choices[0]?.message?.content || '{}'
  let scenario: { stages?: ScenarioStage[] }
  try {
    scenario = JSON.parse(raw.replace(/```json|```/g, '').trim())
  } catch {
    console.error('시나리오 JSON 파싱 실패. raw:', raw)
    return NextResponse.json({ error: '시나리오 파싱 실패' }, { status: 500 })
  }

  const progressState = buildProgressState(scenario)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  // 이전 ready 시나리오는 expired 처리 (한 학생당 활성 시나리오 1개 유지)
  await supabase
    .from('lesson_scenarios')
    .update({ status: 'expired' })
    .eq('student_id', student_id)
    .eq('status', 'ready')

  const { data, error } = await supabase
    .from('lesson_scenarios')
    .insert({
      student_id,
      book,
      unit,
      unit_title: unitData.title || null,
      scenario,
      persona_snapshot: persona || {},
      progress_state: progressState,
      status: 'ready',
      expires_at: expiresAt,
    })
    .select('*')
    .single()

  if (error) {
    console.error('시나리오 저장 오류:', error)
    return NextResponse.json({ error: '시나리오 저장 실패' }, { status: 500 })
  }

  return NextResponse.json({ scenario: data })
}

// ── 진행 상황 업데이트 ─────────────────────────────────
async function updateProgress(req: NextRequest) {
  const supabase = getSupabase()
  const { scenario_id, student_id, progress_state, status } = await req.json()

  if (!scenario_id && !student_id) {
    return NextResponse.json({ error: 'scenario_id 또는 student_id 필수' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (progress_state !== undefined) update.progress_state = progress_state
  if (status) update.status = status

  let query = supabase.from('lesson_scenarios').update(update)
  if (scenario_id) {
    query = query.eq('id', scenario_id)
  } else {
    query = query.eq('student_id', student_id).eq('status', 'ready')
  }

  const { error } = await query
  if (error) {
    console.error('진행 상황 업데이트 오류:', error)
    return NextResponse.json({ error: '업데이트 실패' }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')
    if (action === 'update_progress') return updateProgress(req)
    // 기본/action=generate → 생성
    return generateScenario(req)
  } catch (error) {
    console.error('lesson-scenario POST 오류:', error)
    return NextResponse.json({ error: '처리 실패' }, { status: 500 })
  }
}

// 오늘 시나리오 조회 (가장 최근 ready, 없으면 가장 최근 것)
export async function GET(req: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(req.url)
    const student_id = searchParams.get('student_id')
    if (!student_id) {
      return NextResponse.json({ error: 'student_id 필수' }, { status: 400 })
    }

    const nowIso = new Date().toISOString()
    const { data: ready } = await supabase
      .from('lesson_scenarios')
      .select('*')
      .eq('student_id', student_id)
      .eq('status', 'ready')
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    return NextResponse.json({ scenario: ready || null })
  } catch (error) {
    console.error('시나리오 조회 오류:', error)
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}
