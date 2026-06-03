'use client'

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

// ── 서버(lesson_scenarios) ↔ 폼 변환용 타입 ───────────────
interface ScenarioListItem {
  id: string
  book: string
  book_slug: string
  unit: number
  title: string | null
  total_steps: number
  is_active: boolean
  updated_at: string
}

interface DraftStep {
  target_word: string
  scene_kr: string
  ai_line: string
  expected_pattern: string
  accept_variants: string // 줄바꿈 구분
  hint_line: string
  reaction: string
}
interface DraftPhase {
  label: string
  description: string
  steps: DraftStep[]
}
interface Draft {
  id?: string
  book: string
  unit: number
  title: string
  target_words: string // 줄바꿈 구분
  target_patterns: string // 줄바꿈 구분
  is_active: boolean
  phases: DraftPhase[]
  flow: string // 줄바꿈 구분
  count_yes: string
  count_no: string // 줄바꿈 구분
  closing_ai_line: string
}

const INPUT =
  'bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500 w-full'
const LABEL = 'text-xs text-slate-400'

const toLines = (arr?: string[]) => (arr ?? []).join('\n')
const fromLines = (s: string) => s.split('\n').map(x => x.trim()).filter(Boolean)

function emptyStep(): DraftStep {
  return { target_word: '', scene_kr: '', ai_line: '', expected_pattern: '', accept_variants: '', hint_line: '', reaction: '' }
}
function emptyPhase(): DraftPhase {
  return { label: '', description: '', steps: [emptyStep()] }
}
function emptyDraft(): Draft {
  return {
    book: '', unit: 1, title: '', target_words: '', target_patterns: '',
    is_active: true, phases: [emptyPhase()], flow: '', count_yes: '', count_no: '', closing_ai_line: '',
  }
}

// 서버 행 → 폼 Draft
function rowToDraft(row: Record<string, unknown>): Draft {
  const phasesRaw = Array.isArray(row.phases) ? row.phases : []
  const phases: DraftPhase[] = phasesRaw.map((p: Record<string, unknown>) => ({
    label: typeof p.label === 'string' ? p.label : '',
    description: typeof p.description === 'string' ? p.description : '',
    steps: (Array.isArray(p.steps) ? p.steps : []).map((s: Record<string, unknown>) => ({
      target_word: typeof s.target_word === 'string' ? s.target_word : '',
      scene_kr: typeof s.scene_kr === 'string' ? s.scene_kr : '',
      ai_line: typeof s.ai_line === 'string' ? s.ai_line : '',
      expected_pattern: typeof s.expected_pattern === 'string' ? s.expected_pattern : '',
      accept_variants: toLines(Array.isArray(s.accept_variants) ? s.accept_variants as string[] : []),
      hint_line: typeof s.hint_line === 'string' ? s.hint_line : '',
      reaction: typeof s.reaction === 'string' ? s.reaction : '',
    })),
  }))
  const rules = (row.gpt_rules ?? {}) as { flow?: string[]; counting_rules?: { count_yes?: string; count_no?: string[] } }
  const closing = row.closing as { ai_line?: string } | string | null | undefined
  return {
    id: row.id as string,
    book: (row.book as string) ?? '',
    unit: (row.unit as number) ?? 1,
    title: (row.title as string) ?? '',
    target_words: toLines(row.target_words as string[]),
    target_patterns: toLines(row.target_patterns as string[]),
    is_active: row.is_active !== false,
    phases: phases.length > 0 ? phases : [emptyPhase()],
    flow: toLines(rules.flow),
    count_yes: rules.counting_rules?.count_yes ?? '',
    count_no: toLines(rules.counting_rules?.count_no),
    closing_ai_line: typeof closing === 'string' ? closing : closing?.ai_line ?? '',
  }
}

// 폼 Draft → 서버 저장 payload (step 번호는 phase 순서대로 전역 자동 부여)
function draftToPayload(d: Draft) {
  let stepNo = 0
  const phases = d.phases.map((p, pi) => ({
    phase: pi + 1,
    label: p.label || undefined,
    description: p.description || undefined,
    steps: p.steps.map(s => ({
      step: ++stepNo,
      target_word: s.target_word || undefined,
      scene_kr: s.scene_kr || undefined,
      ai_line: s.ai_line || undefined,
      expected_pattern: s.expected_pattern || undefined,
      accept_variants: fromLines(s.accept_variants),
      hint_line: s.hint_line || undefined,
      reaction: s.reaction || undefined,
    })),
  }))
  return {
    id: d.id,
    book: d.book,
    unit: d.unit,
    title: d.title || null,
    target_words: fromLines(d.target_words),
    target_patterns: fromLines(d.target_patterns),
    is_active: d.is_active,
    phases,
    gpt_rules: {
      flow: fromLines(d.flow),
      counting_rules: { count_yes: d.count_yes || undefined, count_no: fromLines(d.count_no) },
    },
    closing: { ai_line: d.closing_ai_line || '' },
  }
}

export default function ScenarioEditor() {
  const [list, setList] = useState<ScenarioListItem[]>([])
  const [draft, setDraft] = useState<Draft | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const fetchList = useCallback(async () => {
    const res = await fetch('/api/teacher/scenarios')
    const data = await res.json()
    if (res.ok) setList(data.scenarios ?? [])
  }, [])

  useEffect(() => { fetchList() }, [fetchList])

  const openScenario = async (id: string) => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/teacher/scenarios?id=${id}`)
      const data = await res.json()
      if (!res.ok || !data.scenario) throw new Error(data.error || '불러오기 실패')
      setDraft(rowToDraft(data.scenario))
    } catch (err) {
      setMessage({ text: `❌ ${err instanceof Error ? err.message : '불러오기 실패'}`, ok: false })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    if (!draft) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/teacher/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draftToPayload(draft)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '저장 실패')
      setDraft(rowToDraft(data.scenario))
      setMessage({ text: '✅ 저장 완료!', ok: true })
      fetchList()
    } catch (err) {
      setMessage({ text: `❌ ${err instanceof Error ? err.message : '저장 실패'}`, ok: false })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!draft?.id) { setDraft(null); return }
    if (!confirm('이 시나리오를 삭제할까요? 되돌릴 수 없습니다.')) return
    setSaving(true)
    try {
      const res = await fetch(`/api/teacher/scenarios?id=${draft.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '삭제 실패')
      setDraft(null)
      setMessage({ text: '🗑️ 삭제했습니다', ok: true })
      fetchList()
    } catch (err) {
      setMessage({ text: `❌ ${err instanceof Error ? err.message : '삭제 실패'}`, ok: false })
    } finally {
      setSaving(false)
    }
  }

  // ── 중첩 phases/steps 불변 업데이트 헬퍼 ──
  const patch = (p: Partial<Draft>) => setDraft(d => (d ? { ...d, ...p } : d))
  const updatePhase = (pi: number, p: Partial<DraftPhase>) =>
    setDraft(d => d ? { ...d, phases: d.phases.map((ph, i) => i === pi ? { ...ph, ...p } : ph) } : d)
  const updateStep = (pi: number, si: number, s: Partial<DraftStep>) =>
    setDraft(d => d ? {
      ...d,
      phases: d.phases.map((ph, i) => i === pi
        ? { ...ph, steps: ph.steps.map((st, j) => j === si ? { ...st, ...s } : st) }
        : ph),
    } : d)
  const addPhase = () => setDraft(d => d ? { ...d, phases: [...d.phases, emptyPhase()] } : d)
  const removePhase = (pi: number) => setDraft(d => d ? { ...d, phases: d.phases.filter((_, i) => i !== pi) } : d)
  const addStep = (pi: number) => updatePhase(pi, { steps: [...draft!.phases[pi].steps, emptyStep()] })
  const removeStep = (pi: number, si: number) =>
    updatePhase(pi, { steps: draft!.phases[pi].steps.filter((_, j) => j !== si) })

  const totalSteps = draft ? draft.phases.reduce((sum, p) => sum + p.steps.length, 0) : 0

  // ── 목록 화면 ──
  if (!draft) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">🎬 수업 시나리오 ({list.length}개)</span>
          <button
            onClick={() => { setDraft(emptyDraft()); setMessage(null) }}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl px-4 py-2 text-sm transition-colors"
          >+ 새 시나리오</button>
        </div>
        {message && (
          <p className={cn('text-xs rounded-lg px-3 py-2', message.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300')}>
            {message.text}
          </p>
        )}
        {list.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-8 text-center">
            <p className="text-slate-500 text-sm">등록된 시나리오가 없습니다. &ldquo;+ 새 시나리오&rdquo;로 추가하세요.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {list.map(s => (
              <button
                key={s.id}
                onClick={() => openScenario(s.id)}
                disabled={loading}
                className="w-full text-left bg-slate-900/40 border border-slate-700/30 rounded-2xl p-4 hover:border-blue-500/50 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-sm text-white font-medium">{s.book} · Unit {s.unit}</span>
                    {s.title && <span className="text-xs text-slate-400 ml-2">{s.title}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500">{s.total_steps} steps</span>
                    <span className={cn('text-xs px-2 py-0.5 rounded-full',
                      s.is_active ? 'bg-emerald-900/40 text-emerald-400' : 'bg-slate-700 text-slate-400')}>
                      {s.is_active ? '활성' : '비활성'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ── 편집 폼 ──
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between sticky top-0 bg-slate-950 py-2 z-10 -mx-1 px-1">
        <button onClick={() => { setDraft(null); setMessage(null); fetchList() }} className="text-sm text-slate-400 hover:text-white">← 목록</button>
        <div className="flex items-center gap-2">
          <button onClick={handleDelete} disabled={saving} className="text-xs text-red-400 hover:text-red-300 px-3 py-2 disabled:opacity-40">
            {draft.id ? '🗑️ 삭제' : '취소'}
          </button>
          <button onClick={handleSave} disabled={saving || !draft.book.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl px-5 py-2 text-sm transition-colors">
            {saving ? '저장 중...' : '💾 저장'}
          </button>
        </div>
      </div>

      {message && (
        <p className={cn('text-xs rounded-lg px-3 py-2', message.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300')}>
          {message.text}
        </p>
      )}

      {/* 개요 */}
      <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
        <h3 className="text-white text-sm font-medium">개요</h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1">
            <label className={LABEL}>교재명 *</label>
            <input className={INPUT} placeholder="예: Insight Builder 1" value={draft.book}
              onChange={e => patch({ book: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>Unit *</label>
            <input type="number" min={1} className={INPUT} value={draft.unit}
              onChange={e => patch({ unit: Number(e.target.value) || 1 })} />
          </div>
        </div>
        <div className="space-y-1">
          <label className={LABEL}>단원 제목</label>
          <input className={INPUT} placeholder="예: Birthdays" value={draft.title}
            onChange={e => patch({ title: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className={LABEL}>🎯 목표 단어 (한 줄에 하나)</label>
            <textarea className={cn(INPUT, 'h-24 resize-y font-mono')} placeholder={'balloon\nbirthday\ncake'}
              value={draft.target_words} onChange={e => patch({ target_words: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className={LABEL}>💬 목표 패턴 (한 줄에 하나)</label>
            <textarea className={cn(INPUT, 'h-24 resize-y font-mono')} placeholder={'Is it a ___?\nYes, it is.'}
              value={draft.target_patterns} onChange={e => patch({ target_patterns: e.target.value })} />
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={draft.is_active} onChange={e => patch({ is_active: e.target.checked })}
              className="w-4 h-4 accent-blue-500" />
            활성화 (학생에게 노출)
          </label>
          <span className="text-xs text-slate-500">총 {totalSteps} steps (자동 계산)</span>
        </div>
      </section>

      {/* AI 진행 지침 */}
      <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
        <h3 className="text-amber-300 text-sm font-medium">🧭 AI 진행 지침</h3>
        <div className="space-y-1">
          <label className={LABEL}>진행 규칙 flow (한 줄에 하나)</label>
          <textarea className={cn(INPUT, 'h-28 resize-y')} placeholder={'steps를 순서대로 진행한다\n절대 먼저 정답을 말하지 않는다'}
            value={draft.flow} onChange={e => patch({ flow: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className={LABEL}>✅ 진도 카운트 O 기준</label>
          <input className={INPUT} placeholder="accept_variants 중 하나를 hint 없이 스스로 말한 경우"
            value={draft.count_yes} onChange={e => patch({ count_yes: e.target.value })} />
        </div>
        <div className="space-y-1">
          <label className={LABEL}>🚫 카운트 X 기준 (한 줄에 하나)</label>
          <textarea className={cn(INPUT, 'h-20 resize-y')} placeholder={'hint_used: true인 경우\n선택지 버튼으로 고른 경우'}
            value={draft.count_no} onChange={e => patch({ count_no: e.target.value })} />
        </div>
      </section>

      {/* phases / steps */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-slate-300 text-sm font-medium">🎬 수업 시나리오</h3>
          <button onClick={addPhase} className="text-xs text-blue-400 hover:text-blue-300">+ Phase 추가</button>
        </div>
        {draft.phases.map((phase, pi) => {
          // 이 phase 시작 step 번호 (전역 누적)
          const startNo = draft.phases.slice(0, pi).reduce((sum, p) => sum + p.steps.length, 0)
          return (
            <div key={pi} className="bg-slate-900/40 border border-slate-700/40 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-300 shrink-0">Phase {pi + 1}</span>
                {draft.phases.length > 1 && (
                  <button onClick={() => removePhase(pi)} className="text-xs text-red-400/70 hover:text-red-300">Phase 삭제</button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input className={INPUT} placeholder="label (예: AI 주도 — 파티 물건)" value={phase.label}
                  onChange={e => updatePhase(pi, { label: e.target.value })} />
                <input className={INPUT} placeholder="description (선택)" value={phase.description}
                  onChange={e => updatePhase(pi, { description: e.target.value })} />
              </div>

              <div className="space-y-3 pl-2 border-l-2 border-slate-700/50">
                {phase.steps.map((step, si) => (
                  <div key={si} className="bg-slate-800/40 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-emerald-400">Step {startNo + si + 1}</span>
                      {phase.steps.length > 1 && (
                        <button onClick={() => removeStep(pi, si)} className="text-xs text-red-400/70 hover:text-red-300">삭제</button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className={LABEL}>🎯 target_word</label>
                        <input className={INPUT} value={step.target_word} onChange={e => updateStep(pi, si, { target_word: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <label className={LABEL}>💬 expected_pattern</label>
                        <input className={INPUT} value={step.expected_pattern} onChange={e => updateStep(pi, si, { expected_pattern: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className={LABEL}>🎭 scene_kr (상황 설명, 한국어)</label>
                      <input className={INPUT} value={step.scene_kr} onChange={e => updateStep(pi, si, { scene_kr: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <label className={LABEL}>🗣️ ai_line (Coty 대사, {'{{nickname}}'} 사용 가능)</label>
                      <textarea className={cn(INPUT, 'h-16 resize-y')} value={step.ai_line} onChange={e => updateStep(pi, si, { ai_line: e.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <label className={LABEL}>✔️ accept_variants (인정 답안, 한 줄에 하나)</label>
                      <textarea className={cn(INPUT, 'h-16 resize-y')} placeholder={'Yes, it is.\nIt\'s my birthday!'}
                        value={step.accept_variants} onChange={e => updateStep(pi, si, { accept_variants: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className={LABEL}>💡 hint_line</label>
                        <input className={INPUT} value={step.hint_line} onChange={e => updateStep(pi, si, { hint_line: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <label className={LABEL}>🎉 reaction</label>
                        <input className={INPUT} value={step.reaction} onChange={e => updateStep(pi, si, { reaction: e.target.value })} />
                      </div>
                    </div>
                  </div>
                ))}
                <button onClick={() => addStep(pi)} className="text-xs text-blue-400 hover:text-blue-300">+ Step 추가</button>
              </div>
            </div>
          )
        })}
      </section>

      {/* 마무리 */}
      <section className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 space-y-2">
        <h3 className="text-white text-sm font-medium">🏁 마무리 (closing)</h3>
        <textarea className={cn(INPUT, 'h-20 resize-y')} placeholder="Great job today! See you tomorrow!"
          value={draft.closing_ai_line} onChange={e => patch({ closing_ai_line: e.target.value })} />
      </section>

      <div className="flex justify-end pb-4">
        <button onClick={handleSave} disabled={saving || !draft.book.trim()}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl px-6 py-2.5 text-sm transition-colors">
          {saving ? '저장 중...' : '💾 저장'}
        </button>
      </div>
    </div>
  )
}
