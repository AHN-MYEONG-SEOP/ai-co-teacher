'use client'
import { useState, useEffect } from 'react'

interface AsmSession {
  id: string
  session_key: string
  session_date: string
  session_time: string
  title: string
  status: string
  created_at: string
}

export function AssessmentSessionList() {
  const [sessions, setSessions] = useState<AsmSession[]>([])
  const [loading, setLoading] = useState(true)

  const loadSessions = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/asm/sessions')
      const data = await res.json()
      setSessions(data.sessions || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSessions() }, [])

  const statusLabel = (status: string) => {
    if (status === 'ready') return { icon: '🟡', text: '대기중', color: 'text-yellow-400' }
    if (status === 'active') return { icon: '🟢', text: '진행중', color: 'text-emerald-400' }
    return { icon: '⚫', text: '종료됨', color: 'text-slate-500' }
  }

  const activeSessions = sessions.filter(s => s.status === 'ready' || s.status === 'active')
  const endedSessions = sessions.filter(s => s.status === 'ended')

  return (
    <div className="space-y-4">
      {activeSessions.length > 0 && (
        <div className="bg-slate-900/60 border border-yellow-700/50 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-yellow-400 text-lg">⚡</span>
            <h3 className="text-white font-medium">대기중인 Assessment ({activeSessions.length}개)</h3>
            <button onClick={loadSessions} className="ml-auto text-slate-400 hover:text-white text-sm">🔄 새로고침</button>
          </div>
          <div className="space-y-3">
            {activeSessions.map(s => {
              const st = statusLabel(s.status)
              return (
                <div key={s.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span>{st.icon}</span>
                    <span className={`text-sm font-medium ${st.color}`}>{st.text}</span>
                    <span className="text-white font-bold">{s.session_date} {s.session_time}</span>
                    <span className="text-slate-400 text-xs font-mono ml-1">({s.session_key})</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => window.open('/assessment/teacher?session_id=' + s.id, '_blank')}
                      className="bg-blue-700 hover:bg-blue-600 text-white rounded-xl py-2.5 text-xs font-medium transition-colors"
                    >📺 대형화면</button>
                    <button
                      onClick={() => window.open('/assessment/student?session_id=' + s.id, '_blank')}
                      className="bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl py-2.5 text-xs font-medium transition-colors"
                    >🎤 말하기 화면</button>
                    <button
                      onClick={() => window.open('/assessment/vote?session_id=' + s.id, '_blank')}
                      className="bg-purple-700 hover:bg-purple-600 text-white rounded-xl py-2.5 text-xs font-medium transition-colors"
                    >👍 점수입력</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeSessions.length === 0 && !loading && (
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-8 text-center space-y-2">
          <p className="text-slate-400">대기중인 Assessment가 없습니다.</p>
          <p className="text-slate-500 text-sm">Assessment 시나리오 탭에서 세션을 먼저 생성해주세요.</p>
        </div>
      )}

      {endedSessions.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 space-y-3">
          <h3 className="text-slate-400 font-medium text-sm">⚫ 종료된 세션 ({endedSessions.length}개)</h3>
          <div className="space-y-2">
            {endedSessions.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-center justify-between bg-slate-800/50 rounded-xl px-4 py-2">
                <div>
                  <span className="text-slate-400 text-sm">{s.session_date} {s.session_time}</span>
                  <span className="text-slate-500 text-xs ml-2 font-mono">{s.session_key}</span>
                </div>
                <button
                  onClick={() => window.open('/assessment/result?session_id=' + s.id, '_blank')}
                  className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded-lg transition-colors"
                >🏆 결과보기</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && <div className="text-center py-8 text-slate-400 text-sm">로딩 중...</div>}
    </div>
  )
}
