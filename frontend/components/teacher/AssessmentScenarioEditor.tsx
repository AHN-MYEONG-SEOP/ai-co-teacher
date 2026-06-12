'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useCurriculum } from '@/hooks/useCurriculum'

interface AssessmentStep {
  step: number
  scene_kr: string
  expected_pattern: string
}

interface ScenarioForm {
  id?: string
  class_id: string
  class_name: string
  title: string
  book: string
  unit: number | string
  is_active: boolean
  steps: AssessmentStep[]
  saved: boolean
  saving: boolean
  message: { text: string; ok: boolean } | null
}

const TIME_OPTIONS = [
  '07:00','07:30','08:00','08:30','09:00','09:30',
  '10:00','10:30','11:00','11:30','12:00','12:30',
  '13:00','13:30','14:00','14:30','15:00','15:30',
  '16:00','16:30','17:00','17:30','18:00','18:30',
  '19:00','19:30','20:00','20:30','21:00',
]

function emptyScenario(): ScenarioForm {
  return {
    class_id: '', class_name: '',
    title: '', book: '', unit: 1,
    is_active: true, steps: [],
    saved: false, saving: false, message: null
  }
}

export function AssessmentScenarioEditor({ onSaved }: { onSaved?: () => void }) {
  const { booksByLevel, level_order, getUnits } = useCurriculum()
  const [classes, setClasses] = useState<{id:string,name:string}[]>([])
  const [classesLoaded, setClassesLoaded] = useState(false)
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().split('T')[0])
  const [sessionTime, setSessionTime] = useState('09:00')
  const [scenarios, setScenarios] = useState<ScenarioForm[]>([emptyScenario()])
  const [openIndex, setOpenIndex] = useState<number>(0)
  const fileRefs = useRef<(HTMLInputElement | null)[]>([])

  const sessionKey = sessionDate && sessionTime
    ? sessionDate + '-' + sessionTime.replace(':', '')
    : ''

  // 세션키 변경 시 기존 시나리오 로드
  useEffect(() => {
    if (!sessionKey) return
    const loadExisting = async () => {
      // 1. 세션 조회
      const sessRes = await fetch('/api/asm/sessions')
      const sessData = await sessRes.json()
      const existing = (sessData.sessions || []).find((s: any) => s.session_key === sessionKey)
      if (!existing) { setScenarios([emptyScenario()]); return }

      // 2. 해당 세션의 시나리오 조회
      const scRes = await fetch('/api/asm/scenarios?session_id=' + existing.id)
      const scData = await scRes.json()
      if (!scData.scenarios?.length) { setScenarios([emptyScenario()]); return }

      // 3. 기존 시나리오를 폼 형식으로 변환
      const loaded = scData.scenarios.map((sc: any) => ({
        id: sc.id,
        class_id: sc.class_id || '',
        class_name: sc.classes?.name || '',
        title: sc.title || '',
        book: sc.book || '',
        unit: sc.unit || 1,
        is_active: sc.is_active !== false,
        steps: (sc.steps || []).map((s: any) => ({
          step: s.step,
          scene_kr: s.scene_kr || '',
          expected_pattern: s.expected_pattern || '',
        })),
        saved: true,
        saving: false,
        message: { text: '✅ 기존 시나리오 불러옴', ok: true }
      }))
      setScenarios(loaded)
    }
    loadExisting()
  }, [sessionKey])

  const loadClasses = async () => {
    if (classesLoaded) return
    const res = await fetch('/api/teacher/classes')
    const data = await res.json()
    setClasses((data.classes || []).map((c: any) => ({ id: c.id, name: c.name })))
    setClassesLoaded(true)
  }

  const addScenario = () => {
    setScenarios(p => [...p, emptyScenario()])
    setOpenIndex(scenarios.length)  // 새로 추가된 것 자동으로 펼침
  }

  const removeScenario = (i: number) => {
    setScenarios(p => p.filter((_, idx) => idx !== i))
    setOpenIndex(prev => prev >= i ? Math.max(0, prev - 1) : prev)
  }

  const toggleOpen = (i: number) => {
    setOpenIndex(prev => prev === i ? -1 : i)
  }

  const updateScenario = (i: number, field: keyof ScenarioForm, value: unknown) => {
    setScenarios(p => {
      const next = [...p]
      next[i] = { ...next[i], [field]: value }
      return next
    })
  }

  const updateStep = (si: number, stepIdx: number, field: 'scene_kr' | 'expected_pattern', value: string) => {
    setScenarios(p => {
      const next = [...p]
      const steps = [...next[si].steps]
      steps[stepIdx] = { ...steps[stepIdx], [field]: value }
      next[si] = { ...next[si], steps }
      return next
    })
  }

  const addStep = (si: number) => {
    setScenarios(p => {
      const next = [...p]
      next[si] = {
        ...next[si],
        steps: [...next[si].steps, { step: next[si].steps.length + 1, scene_kr: '', expected_pattern: '' }]
      }
      return next
    })
  }

  const removeStep = (si: number, stepIdx: number) => {
    setScenarios(p => {
      const next = [...p]
      next[si] = {
        ...next[si],
        steps: next[si].steps
          .filter((_, idx) => idx !== stepIdx)
          .map((s, idx) => ({ ...s, step: idx + 1 }))
      }
      return next
    })
  }

  const handleFile = (si: number, e: React.ChangeEvent<HTMLInputElement>) => {
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
          .map((r: any, i: number) => ({
            step: i + 1,
            scene_kr: String(r[0] || '').trim(),
            expected_pattern: String(r[1] || '').trim(),
          }))
        if (steps.length > 0) {
          setScenarios(p => {
            const next = [...p]
            next[si] = { ...next[si], steps, message: { text: `✅ ${steps.length}개 Step 업로드됨`, ok: true } }
            return next
          })
        } else {
          setScenarios(p => {
            const next = [...p]
            next[si] = { ...next[si], message: { text: '❌ 데이터 없음. 2행부터 입력해주세요.', ok: false } }
            return next
          })
        }
      } catch {
        setScenarios(p => {
          const next = [...p]
          next[si] = { ...next[si], message: { text: '❌ 파일을 읽을 수 없습니다.', ok: false } }
          return next
        })
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
      ['그것은 가방이에요', 'It is a bag'],
      ['그것은 의자예요', 'It is a chair'],
      ['그것은 책상이에요', 'It is a desk'],
      ['그것은 창문이에요', 'It is a window'],
      ['그것은 문이에요', 'It is a door'],
      ['그것은 시계예요', 'It is a clock'],
      ['그것은 컵이에요', 'It is a cup'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Steps')
    XLSX.writeFile(wb, 'Assessment_Steps_샘플.xlsx')
  }

  const handleSave = async (si: number) => {
    const s = scenarios[si]
    if (!sessionDate) { updateScenario(si, 'message', { text: '날짜를 입력해주세요.', ok: false }); return }
    if (!sessionTime) { updateScenario(si, 'message', { text: '수업시간을 선택해주세요.', ok: false }); return }
    if (!s.class_id) { updateScenario(si, 'message', { text: '반을 선택해주세요.', ok: false }); return }
    if (!s.title.trim()) { updateScenario(si, 'message', { text: '제목을 입력해주세요.', ok: false }); return }
    if (!s.book.trim()) { updateScenario(si, 'message', { text: '교재를 선택해주세요.', ok: false }); return }
    if (s.steps.length === 0) { updateScenario(si, 'message', { text: 'Step을 추가해주세요.', ok: false }); return }
    if (s.steps.some(st => !st.scene_kr || !st.expected_pattern)) {
      updateScenario(si, 'message', { text: '모든 Step의 한국어/정답을 입력해주세요.', ok: false }); return
    }

    updateScenario(si, 'saving', true)
    updateScenario(si, 'message', null)

    try {
      // 1. 세션 생성 or 재사용
      const sessRes = await fetch('/api/asm/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_key: sessionKey,
          session_date: sessionDate,
          session_time: sessionTime,
        })
      })
      const sessData = await sessRes.json()
      if (sessData.error) throw new Error(sessData.error)
      const session_id = sessData.session.id

      // 2. 시나리오 저장
      const body: Record<string, unknown> = {
        title: s.title,
        book: s.book,
        unit: Number(s.unit) || 1,
        session_id,
        class_id: s.class_id,
        is_active: s.is_active,
        steps: s.steps,
      }
      if (s.id) body.id = s.id

      const res = await fetch('/api/asm/scenarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setScenarios(p => {
        const next = [...p]
        next[si] = {
          ...next[si],
          id: data.scenario.id,
          saved: true,
          saving: false,
          message: { text: '✅ 저장 완료!', ok: true }
        }
        return next
      })
      setOpenIndex(-1)  // 저장 후 접기
      onSaved?.()
    } catch (e: any) {
      setScenarios(p => {
        const next = [...p]
        next[si] = { ...next[si], saving: false, message: { text: '❌ 저장 실패: ' + e.message, ok: false } }
        return next
      })
    }
  }

  return (
    <div className="space-y-4">

      {/* 세션 정보 */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-slate-300">📅 세션 정보</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">날짜</label>
            <input
              type="date"
              value={sessionDate}
              onChange={e => setSessionDate(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">수업시간</label>
            <select
              value={sessionTime}
              onChange={e => setSessionTime(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
            >
              {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
        {sessionKey && (
          <p className="text-xs text-emerald-400">🔑 세션키: <span className="font-mono font-bold">{sessionKey}</span></p>
        )}
      </div>

      {/* 시나리오 목록 */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-300">📋 시나리오 목록 ({scenarios.length}개)</p>
          <button
            onClick={addScenario}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-sm font-medium transition-colors"
          >
            + 시나리오 추가
          </button>
        </div>

        {scenarios.map((s, si) => {
          const units = s.book ? getUnits(s.book) : []
          const isOpen = openIndex === si
          const label = s.class_name
            ? `${s.class_name} | ${s.title || '제목 없음'} | ${s.steps.length} steps`
            : `시나리오 ${si + 1} | ${s.steps.length} steps`

          return (
            <div key={si} className={`border rounded-xl overflow-hidden transition-colors ${s.saved ? 'border-emerald-700' : 'border-slate-700'}`}>
              {/* 헤더 */}
              <div
                className="flex items-center justify-between px-4 py-3 bg-slate-800 cursor-pointer hover:bg-slate-700 transition-colors"
                onClick={() => toggleOpen(si)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-sm">{isOpen ? '▼' : '▶'}</span>
                  <span className="text-white text-sm font-medium">{label}</span>
                  {s.saved && <span className="text-xs text-emerald-400">✅ 저장됨</span>}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); removeScenario(si) }}
                  className="text-red-400 hover:text-red-300 text-xs px-2 py-1"
                >
                  🗑️
                </button>
              </div>

              {/* 펼쳐진 내용 */}
              {isOpen && (
                <div className="p-4 space-y-4 bg-slate-900/50">
                  {/* 시나리오 기본 정보 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">반</label>
                      <select
                        value={s.class_id}
                        onFocus={loadClasses}
                        onChange={e => {
                          const cls = classes.find(c => c.id === e.target.value)
                          updateScenario(si, 'class_id', e.target.value)
                          updateScenario(si, 'class_name', cls?.name || '')
                        }}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                      >
                        <option value="">반 선택...</option>
                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">제목</label>
                      <input
                        type="text"
                        placeholder="예: Unit 1 말하기 평가"
                        value={s.title}
                        onChange={e => updateScenario(si, 'title', e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">교재</label>
                      <select
                        value={s.book}
                        onChange={e => updateScenario(si, 'book', e.target.value)}
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
                      <select
                        value={s.unit}
                        onChange={e => updateScenario(si, 'unit', Number(e.target.value))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
                      >
                        {units.length > 0
                          ? units.map(u => <option key={u.unit} value={u.unit}>Unit {u.unit}{u.title ? ' - ' + u.title : ''}</option>)
                          : <option value={1}>Unit 1</option>
                        }
                      </select>
                    </div>
                  </div>

                  {/* Steps */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-slate-400">Steps ({s.steps.length}개)</p>
                      <div className="flex gap-2">
                        <button onClick={downloadSample} className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs">📥 샘플</button>
                        <label className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs cursor-pointer">
                          📂 엑셀
                          <input
                            ref={el => { fileRefs.current[si] = el }}
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            onChange={e => handleFile(si, e)}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">A열: 한국어 | B열: 정답영어 | 2행부터 Step</p>

                    {s.steps.length > 0 && (
                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {s.steps.map((st, stepIdx) => (
                          <div key={stepIdx} className="bg-slate-800 rounded-xl p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-slate-400 font-medium">Step {st.step}</span>
                              <button onClick={() => removeStep(si, stepIdx)} className="text-red-400 hover:text-red-300 text-xs">✕</button>
                            </div>
                            <input
                              type="text"
                              placeholder="한국어 문장"
                              value={st.scene_kr}
                              onChange={e => updateStep(si, stepIdx, 'scene_kr', e.target.value)}
                              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                            />
                            <input
                              type="text"
                              placeholder="정답 영어문장"
                              value={st.expected_pattern}
                              onChange={e => updateStep(si, stepIdx, 'expected_pattern', e.target.value)}
                              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-emerald-500"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      onClick={() => addStep(si)}
                      className="w-full border border-dashed border-slate-600 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 rounded-xl py-2 text-sm transition-colors"
                    >
                      + Step 추가
                    </button>
                  </div>

                  {s.message && (
                    <p className={`text-xs rounded-lg px-3 py-2 ${s.message.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'}`}>
                      {s.message.text}
                    </p>
                  )}

                  <button
                    onClick={() => handleSave(si)}
                    disabled={s.saving}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
                  >
                    {s.saving ? '저장 중...' : '💾 저장'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
