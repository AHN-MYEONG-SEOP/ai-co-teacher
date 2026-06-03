'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import ScenarioEditor from '@/components/teacher/ScenarioEditor'

interface ConversationLog {
  id: string
  student_text: string | null
  ai_text: string | null
  stt_path: string | null
  confidence: number | null
  latency_ms: number | null
  grammar: number | null
  fluency: number | null
  vocabulary: number | null
  overall: number | null
  created_at: string
}

interface RealtimeLog {
  id: string
  session_id: string
  student_text: string | null
  ai_text: string | null
  created_at: string
}

interface LessonReport {
  id: string
  student_id: string
  studied_at: string
  seq: number
  book: string
  unit: number
  unit_title: string | null
  progress: number
  total_turns: number
  correct_turns: number
  hint_used_count: number
  avg_grammar: number | null
  avg_fluency: number | null
  avg_vocabulary: number | null
  avg_overall: number | null
  summary: string | null
  issues: string | null
  created_at: string
}

interface Student {
  id: string
  name: string
  nickname: string | null
  current_book: string | null
  current_unit: number | null
}

interface ProgressStage {
  type: string
  target: string
  weight: number
  min_uses: number
  current_count: number
  completed: boolean
  usage_log: string[]
}

interface ScenarioRow {
  id: string
  student_id: string
  book: string
  unit: number
  unit_title: string | null
  progress_state: { progress: number; stages: ProgressStage[] } | null
  status: string
  updated_at: string
}

interface PersonaRow {
  id: string
  student_id: string
  family_members: Record<string, unknown> | null
  school_life: Record<string, unknown> | null
  food_preferences: Record<string, unknown> | null
  hobbies: Record<string, unknown> | null
  nature: Record<string, unknown> | null
  appearance: Record<string, unknown> | null
  personality: Record<string, unknown> | null
  daily_life: Record<string, unknown> | null
  future: Record<string, unknown> | null
  environment: Record<string, unknown> | null
  learning_patterns: Record<string, unknown> | null
  free_facts: string[] | null
  updated_at: string
}

interface NewStudent {
  name: string
  nickname: string
  email: string
  password: string
}

export default function TeacherDashboard() {
  const supabase = createClient()
  const router = useRouter()
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [teacherId, setTeacherId] = useState<string | null>(null)
  const [logs, setLogs] = useState<ConversationLog[]>([])
  const [realtimeLogs, setRealtimeLogs] = useState<RealtimeLog[]>([])
  const [reports, setReports] = useState<LessonReport[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([])
  const [personas, setPersonas] = useState<PersonaRow[]>([])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'realtime' | 'history' | 'reports' | 'personas' | 'students' | 'scenarios'>('realtime')
  const [newStudent, setNewStudent] = useState<NewStudent>({ name: '', nickname: '', email: '', password: '' })
  const [createLoading, setCreateLoading] = useState(false)
  const [createMessage, setCreateMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const handleCreateStudent = async () => {
    setCreateLoading(true)
    setCreateMessage(null)
    try {
      const res = await fetch('/api/teacher/create-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newStudent),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setCreateMessage({ text: `✅ ${newStudent.name} 학생 계정 생성 완료!`, ok: true })
      setNewStudent({ name: '', nickname: '', email: '', password: '' })
    } catch (err) {
      setCreateMessage({ text: `❌ ${err instanceof Error ? err.message : '생성 실패'}`, ok: false })
    } finally {
      setCreateLoading(false)
    }
  }

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      setUserEmail(user.email || null)
      setTeacherId(user.id)
      setLoading(false)
    }
    checkAuth()
  }, [supabase, router])

  const fetchLogs = useCallback(async () => {
    const { data } = await supabase
      .from('conversation_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
    if (data) setLogs(data)
  }, [supabase])

  // 학생별 최신 시나리오(진행률) 조회
  const fetchScenarios = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const { data } = await supabase
      .from('lesson_scenarios')
      .select('id, student_id, book, unit, unit_title, progress_state, status, updated_at')
      .in('student_id', ids)
      .in('status', ['ready', 'used'])
      .order('updated_at', { ascending: false })
    // 학생당 가장 최근 1개만 유지
    const latest = new Map<string, ScenarioRow>()
    for (const row of (data || []) as ScenarioRow[]) {
      if (!latest.has(row.student_id)) latest.set(row.student_id, row)
    }
    setScenarios(Array.from(latest.values()))
  }, [supabase])

  // 학생별 페르소나 조회
  const fetchPersonas = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return
    const { data } = await supabase
      .from('student_personas')
      .select('*')
      .in('student_id', ids)
    if (data) setPersonas(data)
  }, [supabase])

  // 본인 반 학생만 조회: teacher_id → classes → profiles
  const fetchStudents = useCallback(async () => {
    if (!teacherId) return
    const { data: myClasses } = await supabase
      .from('classes')
      .select('id')
      .eq('teacher_id', teacherId)
    const classIds = (myClasses || []).map(c => c.id)
    if (classIds.length === 0) { setStudents([]); return }
    const { data } = await supabase
      .from('profiles')
      .select('id, name, nickname, current_book, current_unit')
      .eq('role', 'student')
      .in('class_id', classIds)
      .order('name')
    if (data) {
      setStudents(data)
      const ids = data.map(s => s.id)
      fetchScenarios(ids)
      fetchPersonas(ids)
    }
  }, [supabase, teacherId, fetchScenarios, fetchPersonas])

  const fetchReports = useCallback(async (studentId?: string) => {
    let query = supabase
      .from('lesson_reports')
      .select('*')
      .order('studied_at', { ascending: false })
      .order('seq', { ascending: false })
      .limit(50)
    if (studentId) query = query.eq('student_id', studentId)
    const { data } = await query
    if (data) setReports(data)
  }, [supabase])

  useEffect(() => { fetchLogs() }, [fetchLogs])
  useEffect(() => { fetchStudents() }, [fetchStudents])
  useEffect(() => { fetchReports(selectedStudentId || undefined) }, [fetchReports, selectedStudentId])

  useEffect(() => {
    const channel = supabase
      .channel('conversation_logs_realtime')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'conversation_logs',
      }, (payload) => {
        setRealtimeLogs(prev => [payload.new as RealtimeLog, ...prev].slice(0, 20))
        fetchLogs()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, fetchLogs])

  // 수업 진행률 실시간 갱신 (lesson_scenarios 변경)
  useEffect(() => {
    const ids = students.map(s => s.id)
    if (ids.length === 0) return
    const channel = supabase
      .channel('lesson_scenarios_realtime')
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'lesson_scenarios',
      }, () => { fetchScenarios(ids) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, students, fetchScenarios])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  if (loading) return (
    <main className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">로딩 중...</p>
    </main>
  )

  const studentLogs = logs.filter(l => l.student_text)
  const confLogs = studentLogs.filter(l => l.confidence)
  const latLogs = studentLogs.filter(l => l.latency_ms)
  const avgConfidence = confLogs.length > 0
    ? Math.round(confLogs.reduce((a, l) => a + (l.confidence || 0), 0) / confLogs.length * 100) : 0
  const avgLatency = latLogs.length > 0
    ? Math.round(latLogs.reduce((a, l) => a + (l.latency_ms || 0), 0) / latLogs.length) : 0

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🤖</span>
          <div>
            <h1 className="font-bold text-white">AI Co-Teacher</h1>
            <p className="text-xs text-slate-400">교사 대시보드</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400">{userEmail}</span>
          <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-white transition-colors">로그아웃</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* 통계 */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: '총 발화 수', value: studentLogs.length, unit: '회', color: 'text-emerald-400' },
            { label: '평균 신뢰도', value: avgConfidence, unit: '%', color: 'text-blue-400' },
            { label: '평균 응답 지연', value: avgLatency, unit: 'ms', color: 'text-amber-400' },
          ].map((stat) => (
            <div key={stat.label} className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 text-center">
              <p className="text-xs text-slate-400 mb-1">{stat.label}</p>
              <p className={cn('text-3xl font-bold font-mono', stat.color)}>
                {stat.value}<span className="text-sm ml-1">{stat.unit}</span>
              </p>
            </div>
          ))}
        </div>

        {/* 탭 */}
        <div className="flex gap-2 flex-wrap">
          {(['realtime', 'history', 'reports', 'personas', 'students', 'scenarios'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn('px-4 py-2 rounded-xl text-sm transition-colors',
                activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              )}>
              {tab === 'realtime' ? '🔴 실시간' : tab === 'history' ? '📋 대화기록' : tab === 'reports' ? '📊 학습이력' : tab === 'personas' ? '👤 페르소나' : tab === 'students' ? '👨‍🎓 학생관리' : '🎬 시나리오'}
            </button>
          ))}
          <button onClick={() => { fetchLogs(); fetchReports(selectedStudentId || undefined); const ids = students.map(s => s.id); fetchScenarios(ids); fetchPersonas(ids) }} className="ml-auto px-4 py-2 rounded-xl text-sm bg-slate-800 text-slate-400 hover:text-white transition-colors">
            🔄 새로고침
          </button>
        </div>

        {/* 학습 이력 */}
        {activeTab === 'reports' && (
          <div className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedStudentId(null)}
                className={cn('px-3 py-1.5 rounded-xl text-xs transition-colors',
                  !selectedStudentId ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                )}
              >전체</button>
              {students.map(s => (
                <button key={s.id} onClick={() => setSelectedStudentId(s.id)}
                  className={cn('px-3 py-1.5 rounded-xl text-xs transition-colors',
                    selectedStudentId === s.id ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                  )}
                >{s.name}</button>
              ))}
            </div>
            {reports.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-8 text-center">
                <p className="text-slate-500">학습 이력이 없습니다</p>
              </div>
            ) : reports.map(r => (
              <div key={r.id} className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-500">{r.studied_at}</span>
                      <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">#{r.seq}</span>
                      <span className="text-xs text-slate-400">{students.find(s => s.id === r.student_id)?.name || ''}</span>
                    </div>
                    <p className="text-sm text-white font-medium mt-1">
                      {r.book} · Unit {r.unit}{r.unit_title ? ` — ${r.unit_title}` : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={cn('text-lg font-bold',
                      r.progress >= 80 ? 'text-emerald-400' : r.progress >= 50 ? 'text-amber-400' : 'text-slate-400'
                    )}>{r.progress}%</span>
                    <p className="text-xs text-slate-500">{r.correct_turns}/{r.total_turns}회 완성</p>
                  </div>
                </div>
                {r.avg_overall && (
                  <div className="flex gap-3 text-xs">
                    <span className="text-slate-400">문법 <span className="text-white font-bold">{r.avg_grammar}</span></span>
                    <span className="text-slate-400">유창성 <span className="text-white font-bold">{r.avg_fluency}</span></span>
                    <span className="text-slate-400">어휘 <span className="text-white font-bold">{r.avg_vocabulary}</span></span>
                    <span className="text-slate-400">종합 <span className={cn('font-bold',
                      (r.avg_overall||0) >= 80 ? 'text-emerald-400' : (r.avg_overall||0) >= 60 ? 'text-amber-400' : 'text-red-400'
                    )}>{r.avg_overall}</span></span>
                    {r.hint_used_count > 0 && <span className="text-slate-500">💡 힌트 {r.hint_used_count}회</span>}
                  </div>
                )}
                {r.summary && (
                  <div className="bg-slate-800/50 rounded-xl px-3 py-2 space-y-1">
                    <p className="text-xs text-slate-300 leading-relaxed">{r.summary}</p>
                    {r.issues && r.issues !== '없음' && (
                      <p className="text-xs text-amber-300/80 leading-relaxed whitespace-pre-line">{r.issues}</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 실시간 */}
        {activeTab === 'realtime' && (
          <div className="space-y-3">
            {/* 수업 진행률 */}
            <div className="space-y-2">
              <span className="text-sm text-slate-400">📚 수업 진행률 ({students.length}명)</span>
              {students.length === 0 ? (
                <div className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-4 text-center">
                  <p className="text-slate-500 text-sm">담당 반에 배정된 학생이 없습니다</p>
                </div>
              ) : students.map(s => {
                const sc = scenarios.find(x => x.student_id === s.id)
                const prog = sc?.progress_state?.progress ?? 0
                const stages = sc?.progress_state?.stages ?? []
                return (
                  <div key={s.id} className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-sm text-white font-medium">{s.name}</span>
                        <span className="text-xs text-slate-500 ml-2 truncate">
                          {sc ? `${sc.book} U${sc.unit}${sc.unit_title ? `-${sc.unit_title}` : ''}` : '시나리오 준비 전'}
                        </span>
                      </div>
                      <span className={cn('text-sm font-bold tabular-nums shrink-0',
                        prog >= 80 ? 'text-emerald-400' : prog >= 50 ? 'text-amber-400' : 'text-slate-400'
                      )}>{prog}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all duration-700',
                        prog >= 80 ? 'bg-emerald-500' : prog >= 50 ? 'bg-amber-500' : 'bg-violet-500'
                      )} style={{ width: `${prog}%` }} />
                    </div>
                    {stages.length > 0 && (
                      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                        {stages.slice(0, 10).map((st, i) => (
                          <span key={i} className={cn('text-xs',
                            st.completed ? 'text-emerald-400' : st.current_count > 0 ? 'text-amber-400' : 'text-slate-600'
                          )}>
                            {st.target}{st.completed ? '✅' : st.current_count > 0 ? `🔄${st.current_count}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-sm text-slate-400">실시간 대화 스트림</span>
            </div>
            {realtimeLogs.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-8 text-center">
                <p className="text-slate-500">학생이 말하면 여기에 실시간으로 표시됩니다</p>
              </div>
            ) : realtimeLogs.map((log) => (
              <div key={log.id} className="rounded-xl p-4 border text-sm bg-slate-900/30 border-slate-700/30 space-y-2">
                <span className="text-xs text-slate-500">{new Date(log.created_at).toLocaleTimeString('ko-KR')}</span>
                {log.student_text && (
                  <p className="text-emerald-200"><span className="text-xs opacity-60">🧑 학생: </span>{log.student_text}</p>
                )}
                {log.ai_text && (
                  <p className="text-violet-200"><span className="text-xs opacity-60">🤖 AI: </span>{log.ai_text}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 기록 */}
        {activeTab === 'history' && (
          <div className="space-y-2">
            {logs.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-8 text-center">
                <p className="text-slate-500">아직 대화 기록이 없습니다</p>
              </div>
            ) : logs.map((log) => (
              <div key={log.id} className="rounded-xl p-3 border text-sm bg-slate-900/10 border-slate-800/30 space-y-1.5">
                {log.student_text && (
                  <p className="text-emerald-200 text-sm"><span className="opacity-50">🧑 </span>{log.student_text}</p>
                )}
                {log.ai_text && (
                  <p className="text-violet-200 text-sm"><span className="opacity-50">🤖 </span>{log.ai_text}</p>
                )}
                <div className="flex gap-3 mt-1 flex-wrap">
                  {log.stt_path && (
                    <span className={cn('text-xs px-1.5 py-0.5 rounded',
                      log.stt_path === 'A' ? 'bg-emerald-900/40 text-emerald-400' : 'bg-amber-900/40 text-amber-400'
                    )}>Path {log.stt_path}</span>
                  )}
                  {log.confidence && <span className="text-xs text-slate-500">신뢰도 {Math.round(log.confidence * 100)}%</span>}
                  {log.latency_ms && <span className="text-xs text-slate-500">{log.latency_ms}ms</span>}
                  {log.overall && <span className="text-xs text-emerald-400">종합 {log.overall}점</span>}
                  <span className="text-xs text-slate-600">{new Date(log.created_at).toLocaleString('ko-KR')}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 페르소나 */}
        {activeTab === 'personas' && (
          <div className="space-y-4">
            {students.length === 0 ? (
              <div className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-8 text-center">
                <p className="text-slate-500">담당 반에 배정된 학생이 없습니다</p>
              </div>
            ) : students.map(s => {
              const p = personas.find(x => x.student_id === s.id)
              const fmt = (obj: Record<string, unknown> | null | undefined): string => {
                if (!obj || Object.keys(obj).length === 0) return ''
                return Object.entries(obj)
                  .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}`)
                  .join(' · ')
              }
              const rows: { label: string; value: string }[] = [
                { label: '관심사', value: fmt(p?.hobbies) },
                { label: '가족', value: fmt(p?.family_members) },
                { label: '음식', value: fmt(p?.food_preferences) },
                { label: '학교생활', value: fmt(p?.school_life) },
                { label: '반려/자연', value: fmt(p?.nature) },
                { label: '성향', value: fmt(p?.personality) },
                { label: '꿈', value: fmt(p?.future) },
                { label: '취약점', value: p?.learning_patterns ? fmt({ ...(p.learning_patterns as Record<string, unknown>) }) : '' },
              ].filter(r => r.value)
              const facts = p?.free_facts || []
              return (
                <div key={s.id} className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-white font-medium">{s.name}</span>
                    {p?.updated_at && (
                      <span className="text-xs text-slate-500">업데이트: {new Date(p.updated_at).toLocaleDateString('ko-KR')}</span>
                    )}
                  </div>
                  {rows.length === 0 && facts.length === 0 ? (
                    <p className="text-xs text-slate-500">아직 수집된 페르소나 정보가 없습니다</p>
                  ) : (
                    <div className="space-y-1">
                      {rows.map(r => (
                        <div key={r.label} className="flex gap-2 text-xs">
                          <span className="text-slate-500 shrink-0 w-16">{r.label}</span>
                          <span className="text-slate-200">{r.value}</span>
                        </div>
                      ))}
                      {facts.length > 0 && (
                        <div className="flex gap-2 text-xs">
                          <span className="text-slate-500 shrink-0 w-16">알려진 사실</span>
                          <span className="text-slate-200">{facts.join(' · ')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* 학생 관리 */}
        {activeTab === 'students' && (
          <div className="space-y-4">
            <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 space-y-4">
              <h3 className="text-white font-medium">👨‍🎓 새 학생 계정 생성</h3>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="학생 이름 (예: 김민수)"
                  value={newStudent.name}
                  onChange={e => setNewStudent(p => ({ ...p, name: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="text"
                  placeholder="호칭 (예: Minsu, 민수야) — 비워두면 이름 사용"
                  value={newStudent.nickname}
                  onChange={e => setNewStudent(p => ({ ...p, nickname: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="email"
                  placeholder="이메일"
                  value={newStudent.email}
                  onChange={e => setNewStudent(p => ({ ...p, email: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <input
                  type="password"
                  placeholder="비밀번호"
                  value={newStudent.password}
                  onChange={e => setNewStudent(p => ({ ...p, password: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>
              <button
                onClick={handleCreateStudent}
                disabled={createLoading || !newStudent.name || !newStudent.email || !newStudent.password}
                className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-6 py-2 text-sm transition-colors"
              >
                {createLoading ? '생성 중...' : '계정 생성'}
              </button>
              {createMessage && (
                <p className={cn('text-xs rounded-lg px-3 py-2',
                  createMessage.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'
                )}>
                  {createMessage.text}
                </p>
              )}
            </div>
          </div>
        )}

        {/* 시나리오 편집 */}
        {activeTab === 'scenarios' && <ScenarioEditor />}
      </div>
    </main>
  )
}
