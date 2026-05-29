'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'

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
  const [logs, setLogs] = useState<ConversationLog[]>([])
  const [realtimeLogs, setRealtimeLogs] = useState<RealtimeLog[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'realtime' | 'history' | 'students'>('realtime')
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

  useEffect(() => { fetchLogs() }, [fetchLogs])

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
        <div className="flex gap-2">
          {(['realtime', 'history', 'students'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={cn('px-4 py-2 rounded-xl text-sm transition-colors',
                activeTab === tab ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              )}>
              {tab === 'realtime' ? '🔴 실시간 모니터링' : tab === 'history' ? '📋 대화 기록' : '👨‍🎓 학생 관리'}
            </button>
          ))}
          <button onClick={fetchLogs} className="ml-auto px-4 py-2 rounded-xl text-sm bg-slate-800 text-slate-400 hover:text-white transition-colors">
            🔄 새로고침
          </button>
        </div>

        {/* 실시간 */}
        {activeTab === 'realtime' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
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
      </div>
    </main>
  )
}
