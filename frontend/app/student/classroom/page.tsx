'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useWebSpeech } from '@/hooks/useWebSpeech'
import { useMediaRecorder } from '@/hooks/useMediaRecorder'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/version'

// ── 타입 ──────────────────────────────────────────────
interface ChatMessage {
  id: string
  role: 'ai' | 'student'
  text: string
  createdAt: string
}

// ── 메인 컴포넌트 ──────────────────────────────────────
function StudentClassroomContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const supabase = createClient()

  // ── State ──────────────────────────────────────────
  const [loading, setLoading] = useState(true)
  const [noLesson, setNoLesson] = useState(false)
  const [studentId, setStudentId] = useState<string | null>(null)
  const studentIdRef = useRef<string | null>(null)
  const [studentName, setStudentName] = useState('학생')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isHolding, setIsHolding] = useState(false)
  const [interimText, setInterimText] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // classroomLogId: 현재 답변해야 할 conversation_logs row id
  // sessionStorage에 저장하여 마이크 활성화 조건으로 사용

  // ── 자동 스크롤 ────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── 초기화 ─────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) {
      setTimeout(() => setNoLesson(true), 4000)
      setLoading(false)
      return
    }
    init()
  }, [sessionId])

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setStudentId(user.id)
    studentIdRef.current = user.id

    // 프로필 로드
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, nickname')
      .eq('id', user.id)
      .single()
    const name = profile?.nickname || profile?.name || '학생'
    setStudentName(name)

    // 세션 확인
    const { data: sess } = await supabase
      .from('sessions')
      .select('id, status')
      .eq('id', sessionId)
      .single()
    if (!sess || sess.status !== 'on') {
      setNoLesson(true)
      setLoading(false)
      return
    }

    // 입장 row INSERT (session_type='START')
    const { data: logData } = await supabase
      .from('conversation_logs')
      .insert({
        session_id: sessionId,
        student_id: user.id,
        target_student_id: user.id,
        session_type: 'START',
      })
      .select('id')
      .single()
    if (logData) {
      sessionStorage.setItem('classroomLogId', logData.id)
    }

    setLoading(false)
  }

  // ── Realtime 구독 ──────────────────────────────────
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`student_classroom:${sessionId}:${studentIdRef.current}`)
      // INSERT: 새 AI 메시지 (logId 저장)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_logs',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const log = payload.new
        if (log.target_student_id !== studentIdRef.current) return
        sessionStorage.setItem('classroomLogId', log.id)
      })
      // UPDATE: ai_text 또는 student_text 변경
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_logs',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const log = payload.new
        if (log.target_student_id !== studentIdRef.current && log.student_id !== studentIdRef.current) return
        // AI 메시지 표시
        if (log.ai_text && log.target_student_id === studentIdRef.current) {
          sessionStorage.setItem('classroomLogId', log.id)
          setMessages(prev => {
            const exists = prev.find(m => m.id === log.id)
            if (exists) return prev.map(m => m.id === log.id ? { ...m, text: log.ai_text } : m)
            return [...prev, { id: log.id, role: 'ai', text: log.ai_text, createdAt: log.created_at || new Date().toISOString() }]
          })
        }
        // 학생 답변 표시
        if (log.student_text && log.student_id === studentIdRef.current) {
          setMessages(prev => {
            const sid = log.id + '_s'
            if (prev.find(m => m.id === sid)) return prev
            return [...prev, { id: sid, role: 'student', text: log.student_text, createdAt: log.created_at || new Date().toISOString() }]
          })
        }
      })
      // sessions UPDATE: 수업 종료(status='off') 감지
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        if (payload.new.status === 'off') {
          sessionStorage.removeItem('classroomLogId')
          router.push('/')
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  // ── STT 결과 처리 ──────────────────────────────────
  const handleFinalResult = async (transcript: string) => {
    if (!transcript.trim() || !sessionId || !studentIdRef.current) return
    setIsHolding(false)
    setInterimText('')

    const logId = sessionStorage.getItem('classroomLogId')
    if (!logId) return
    sessionStorage.removeItem('classroomLogId')

    // student_text UPDATE → 선생님 화면에서 채점
    await supabase
      .from('conversation_logs')
      .update({ student_text: transcript })
      .eq('id', logId)
  }

  // ── 마이크 ─────────────────────────────────────────
  const { startRecording, discardBlob } = useMediaRecorder({ onBlobReady: () => {} })
  const { isSupported, startListening, stopListening } = useWebSpeech({
    onInterimResult: (text) => setInterimText(text),
    onFinalResult: handleFinalResult,
    onFallback: () => {},
    onError: () => {},
    onLog: () => {},
    onStreamReady: startRecording,
    sttEngine: 'deepgram',
  })

  const handleMicStart = async () => {
    if (isHolding) return
    const logId = sessionStorage.getItem('classroomLogId')
    if (!logId) return
    setIsHolding(true)
    await startListening()
  }

  const handleMicStop = async () => {
    if (!isHolding) return
    setIsHolding(false)
    await stopListening()
  }

  // ── 로딩 ───────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">수업 화면 로딩 중...</p>
    </div>
  )

  // ── 수업 없음 ──────────────────────────────────────
  if (noLesson || !sessionId) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center gap-4">
      <p className="text-2xl">📚</p>
      <p className="text-white font-medium">진행중인 수업이 없습니다</p>
      <p className="text-slate-400 text-sm">선생님이 수업을 시작하면 자동으로 연결됩니다</p>
      <button
        onClick={() => router.push('/')}
        className="mt-4 px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 transition-colors"
      >
        자습화면으로 돌아가기
      </button>
    </div>
  )

  const hasLogId = !!sessionStorage.getItem('classroomLogId')

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg">🏫</span>
          <div>
            <p className="text-sm font-bold text-white">수업 중</p>
            <p className="text-xs text-slate-400">{studentName} · {APP_VERSION}</p>
          </div>
        </div>
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
      </header>

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-slate-600 text-sm">Coty 선생님을 기다리는 중...</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={cn(
            'flex',
            msg.role === 'ai' ? 'justify-start' : 'justify-end'
          )}>
            <div className={cn(
              'max-w-[80%] rounded-2xl px-4 py-3',
              msg.role === 'ai'
                ? 'bg-violet-900/40 border border-violet-700/30'
                : 'bg-emerald-900/40 border border-emerald-700/30'
            )}>
              <p className={cn('text-[10px] mb-1', msg.role === 'ai' ? 'text-violet-400' : 'text-emerald-400')}>
                {msg.role === 'ai' ? '💬 Coty' : '🧑 나'}
              </p>
              <p className="text-sm text-white">{msg.text}</p>
            </div>
          </div>
        ))}
        {interimText && (
          <div className="flex justify-end">
            <div className="bg-slate-800 rounded-2xl px-4 py-3 max-w-[80%]">
              <p className="text-sm text-slate-400 italic">{interimText}...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 마이크 버튼 */}
      <div className="border-t border-slate-800 px-4 py-6 flex flex-col items-center gap-3">
        {!hasLogId && messages.length > 0 && (
          <p className="text-xs text-slate-500">Coty의 메시지를 기다리는 중...</p>
        )}
        <button
          onMouseDown={handleMicStart}
          onMouseUp={handleMicStop}
          onMouseLeave={() => { if (isHolding) handleMicStop() }}
          onTouchStart={(e) => { e.preventDefault(); handleMicStart() }}
          onTouchEnd={(e) => { e.preventDefault(); handleMicStop() }}
          disabled={!isSupported}
          className={cn(
            'w-20 h-20 rounded-full flex items-center justify-center text-3xl transition-all duration-200 select-none',
            isHolding
              ? 'bg-red-500 scale-110 ring-4 ring-red-400/40'
              : hasLogId
                ? 'bg-emerald-600 hover:bg-emerald-500 ring-2 ring-emerald-500/60'
                : 'bg-slate-700 opacity-50 cursor-not-allowed'
          )}
        >
          {isHolding ? '🎙️' : '🎤'}
        </button>
        <p className="text-xs text-slate-500">
          {isHolding ? '손을 떼면 전송됩니다' : hasLogId ? '누르고 있는 동안 말하세요' : '대기 중'}
        </p>
      </div>
    </div>
  )
}

export default function StudentClassroomPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">로딩 중...</p>
      </div>
    }>
      <StudentClassroomContent />
    </Suspense>
  )
}
