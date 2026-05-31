import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'

const supabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 세션 시작 시 report row 생성
export async function POST(req: NextRequest) {
  try {
    const db = supabase()
    const { action, ...body } = await req.json()

    // ── 1. 세션 시작 → row 생성 ──────────────────────
    if (action === 'start') {
      const { student_id, session_id, book, unit, unit_title } = body
      const today = new Date().toISOString().split('T')[0]

      // 오늘 같은 학생의 seq 최댓값 조회
      const { data: existing } = await db
        .from('lesson_reports')
        .select('seq')
        .eq('student_id', student_id)
        .eq('studied_at', today)
        .order('seq', { ascending: false })
        .limit(1)

      const seq = existing && existing.length > 0 ? existing[0].seq + 1 : 1

      const { data, error } = await db
        .from('lesson_reports')
        .insert({
          student_id,
          session_id: session_id || null,
          studied_at: today,
          seq,
          book,
          unit,
          unit_title: unit_title || null,
          progress: 0,
          total_turns: 0,
          correct_turns: 0,
          hint_used_count: 0,
        })
        .select('id')
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ report_id: data.id, seq })
    }

    // ── 2. 대화 중 누적 업데이트 ─────────────────────
    if (action === 'update') {
      const { report_id, progress, total_turns, correct_turns, hint_used_count,
              avg_grammar, avg_fluency, avg_vocabulary, avg_overall } = body

      await db
        .from('lesson_reports')
        .update({
          ...(progress !== undefined && { progress }),
          ...(total_turns !== undefined && { total_turns }),
          ...(correct_turns !== undefined && { correct_turns }),
          ...(hint_used_count !== undefined && { hint_used_count }),
          ...(avg_grammar !== undefined && { avg_grammar }),
          ...(avg_fluency !== undefined && { avg_fluency }),
          ...(avg_vocabulary !== undefined && { avg_vocabulary }),
          ...(avg_overall !== undefined && { avg_overall }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', report_id)

      return NextResponse.json({ success: true })
    }

    // ── 3. 세션 종료 → GPT 요약 생성 ────────────────
    if (action === 'finish') {
      const { report_id, conversation_history, book, unit, unit_title,
              progress, corrections } = body

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

      const summaryRes = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are analyzing an English lesson session for a Korean elementary student.
Respond ONLY with a JSON object (no markdown):
{
  "summary": "오늘 학습 내용 요약 (한국어, 2-3문장)",
  "issues": "주요 이슈 목록 (한국어, 없으면 '없음')",
  "strength": "잘한 점 (한국어, 1문장)"
}`,
          },
          {
            role: 'user',
            content: `Book: ${book}, Unit ${unit} - ${unit_title}
Final progress: ${progress}%
Corrections made: ${corrections || 'none'}
Conversation:
${conversation_history}`,
          },
        ],
        max_tokens: 300,
        temperature: 0.3,
      })

      let summary = ''
      let issues = ''
      let strength = ''
      try {
        const raw = summaryRes.choices[0]?.message?.content || '{}'
        const parsed = JSON.parse(raw)
        summary = parsed.summary || ''
        issues = parsed.issues || ''
        strength = parsed.strength || ''
      } catch { }

      await db
        .from('lesson_reports')
        .update({
          progress,
          summary,
          issues: issues + (strength ? `\n✅ ${strength}` : ''),
          updated_at: new Date().toISOString(),
        })
        .eq('id', report_id)

      return NextResponse.json({ success: true, summary, issues })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('lesson-report 오류:', error)
    return NextResponse.json({ error: '서버 오류' }, { status: 500 })
  }
}

// 학습 이력 조회
export async function GET(req: NextRequest) {
  try {
    const db = supabase()
    const { searchParams } = new URL(req.url)
    const student_id = searchParams.get('student_id')
    const limit = parseInt(searchParams.get('limit') || '20')

    if (!student_id) return NextResponse.json({ error: 'student_id 필수' }, { status: 400 })

    const { data } = await db
      .from('lesson_reports')
      .select('*')
      .eq('student_id', student_id)
      .order('studied_at', { ascending: false })
      .order('seq', { ascending: false })
      .limit(limit)

    return NextResponse.json({ reports: data || [] })
  } catch (error) {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}
