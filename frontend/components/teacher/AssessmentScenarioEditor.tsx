'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useCurriculum } from '@/hooks/useCurriculum'

interface AssessmentStep {
  scene_kr: string
  expected_pattern: string
}

interface AssessmentScenario {
  id?: string
  title: string
  book: string
  unit: number | string
  assessment_date: string
  is_active: boolean
  steps: AssessmentStep[]
}

export function AssessmentScenarioEditor({ onSaved }: { onSaved?: () => void }) {
  const { booksByLevel, level_order, getUnits } = useCurriculum()
  const [form, setForm] = useState<AssessmentScenario>({
    title: '',
    book: '',
    unit: 1,
    assessment_date: new Date().toISOString().split('T')[0],
    is_active: true,
    steps: [{ scene_kr: '', expected_pattern: '' }]
  })
  const [customUnit, setCustomUnit] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const units = form.book ? getUnits(form.book) : []

  const updateStep = (i: number, field: keyof AssessmentStep, value: string) => {
    setForm(p => {
      const steps = [...p.steps]
      steps[i] = { ...steps[i], [field]: value }
      return { ...p, steps }
    })
  }

  const addStep = () => setForm(p => ({ ...p, steps: [...p.steps, { scene_kr: '', expected_pattern: '' }] }))

  const removeStep = (i: number) => setForm(p => ({ ...p, steps: p.steps.filter((_, idx) => idx !== i) }))

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target?.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json<any>(ws, { header: 1 })
        const steps: AssessmentStep[] = rows.slice(1)
          .filter((r: any) => r[0] && r[1])
          .map((r: any) => ({
            scene_kr: String(r[0] || '').trim(),
            expected_pattern: String(r[1] || '').trim(),
          }))
        if (steps.length > 0) {
          setForm(p => ({ ...p, steps }))
          setMessage({ text: `✅ ${steps.length}개 Step 불러왔습니다.`, ok: true })
        }
      } catch {
        setMessage({ text: '❌ 파일을 읽을 수 없습니다.', ok: false })
      }
    }
    reader.readAsBinaryString(file)
  }

  const downloadSample = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['한국어 문장', '정답 영어문장'],
      ['그것은 책이에요', 'It is a book'],
      ['그것은 연필이에요', 'It is a pencil'],
      ['그것은 지우개예요', 'It is an eraser'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Assessment')
    XLSX.writeFile(wb, 'Assessment_시나리오_샘플.xlsx')
  }

  const handleSave = async () => {
    if (!form.title.trim()) { setMessage({ text: '제목을 입력해주세요.', ok: false }); return }
    if (!form.book.trim()) { setMessage({ text: '교재를 선택해주세요.', ok: false }); return }
    if (form.steps.some(s => !s.scene_kr || !s.expected_pattern)) {
      setMessage({ text: '모든 Step의 한국어/정답을 입력해주세요.', ok: false }); return
    }
    setLoading(true)
    setMessage(null)
    try {
      const phases = [{
        phase: 1,
        label: 'Assessment',
        steps: form.steps.map((s, i) => ({
          step: i + 1,
          scene_kr: s.scene_kr,
          expected_pattern: s.expected_pattern,
          target_word: '',
          ai_line: '',
          accept_variants: '',
          hint_line: '',
          reaction: '',
        }))
      }]
      const body = {
        title: form.title,
        book: form.book,
        unit: Number(form.unit) || 1,
        assessment_date: form.assessment_date,
        scenario_type: 'assessment',
        is_active: form.is_active,
        phases,
        target_words: [],
        target_patterns: [],
        gpt_rules: {},
        closing: {},
        ...(form.id ? { id: form.id } : {})
      }
      const res = await fetch('/api/teacher/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setMessage({ text: '✅ 저장 완료!', ok: true })
      setForm({
        title: '', book: '', unit: 1,
        assessment_date: new Date().toISOString().split('T')[0],
        is_active: true,
        steps: [{ scene_kr: '', expected_pattern: '' }]
      })
      onSaved?.()
    } catch (e: any) {
      setMessage({ text: '❌ 저장 실패: ' + e.message, ok: false })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* 기본 정보 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs text-slate-400 mb-1 block">제목 (시나리오 식별자)</label>
          <input
            type="text"
            placeholder="예: Unit 1 말하기 평가"
            value={form.title}
            onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">교재</label>
          <select
            value={form.book}
            onChange={e => { setForm(p => ({ ...p, book: e.target.value, unit: 1 })); setCustomUnit(false) }}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="">교재 선택...</option>
            {level_order.map(level => (
              booksByLevel[level] && (
                <optgroup key={level} label={level}>
                  {booksByLevel[level].map(book => (
                    <option key={book} value={book}>{book}</option>
                  ))}
                </optgroup>
              )
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">Unit</label>
          {!customUnit ? (
            <div className="flex gap-2">
              <select
                value={form.unit}
                onChange={e => setForm(p => ({ ...p, unit: Number(e.target.value) }))}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
              >
                {units.length > 0
                  ? units.map(u => <option key={u.unit} value={u.unit}>Unit {u.unit}{u.title ? ' - ' + u.title : ''}</option>)
                  : <option value={1}>Unit 1</option>
                }
              </select>
              <button
                onClick={() => setCustomUnit(true)}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-xl"
              >
                직접입력
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="number"
                value={form.unit}
                onChange={e => setForm(p => ({ ...p, unit: e.target.value }))}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
              />
              <button
                onClick={() => setCustomUnit(false)}
                className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs rounded-xl"
              >
                목록선택
              </button>
            </div>
          )}
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">평가 날짜</label>
          <input
            type="date"
            value={form.assessment_date}
            onChange={e => setForm(p => ({ ...p, assessment_date: e.target.value }))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
          />
        </div>
        <div className="flex items-end pb-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={e => setForm(p => ({ ...p, is_active: e.target.checked }))}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-slate-300">활성화</span>
          </label>
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-slate-300">Steps ({form.steps.length}개)</p>
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {form.steps.map((s, i) => (
            <div key={i} className="bg-slate-800 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 font-medium">Step {i + 1}</span>
                {form.steps.length > 1 && (
                  <button onClick={() => removeStep(i)} className="text-red-400 hover:text-red-300 text-xs">✕ 삭제</button>
                )}
              </div>
              <input
                type="text"
                placeholder="한국어 문장 (예: 그것은 책이에요)"
                value={s.scene_kr}
                onChange={e => updateStep(i, 'scene_kr', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                placeholder="정답 영어문장 (예: It is a book)"
                value={s.expected_pattern}
                onChange={e => updateStep(i, 'expected_pattern', e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500"
              />
            </div>
          ))}
        </div>
        <button
          onClick={addStep}
          className="w-full border border-dashed border-slate-600 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 rounded-xl py-2 text-sm transition-colors"
        >
          + Step 추가
        </button>
      </div>

      {/* 엑셀 업로드 */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
        <p className="text-xs font-medium text-slate-300">📂 엑셀로 Step 일괄 등록</p>
        <p className="text-xs text-slate-500">A열: 한국어 문장 &nbsp;|&nbsp; B열: 정답 영어문장</p>
        <div className="flex gap-2">
          <button
            onClick={downloadSample}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-2 text-xs font-medium transition-colors"
          >
            📥 샘플 다운로드
          </button>
          <label className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-xl py-2 text-xs font-medium transition-colors text-center cursor-pointer">
            📂 파일 선택
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} className="hidden" />
          </label>
        </div>
      </div>

      {message && (
        <p className={`text-xs rounded-lg px-3 py-2 ${message.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>
          {message.text}
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={loading}
        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl py-3 text-sm font-medium transition-colors"
      >
        {loading ? '저장 중...' : '💾 저장'}
      </button>
    </div>
  )
}
