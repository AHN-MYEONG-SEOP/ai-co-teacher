'use client'
import { useEffect, useState, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useWebSpeech } from '@/hooks/useWebSpeech'
import { useMediaRecorder } from '@/hooks/useMediaRecorder'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/version'

interface ClassroomSession {
  id: string
  current_step: number
  current_step_type: string | null
  total_steps: number
  status: string
  coty_message: string | null
  coty_scene_kr: string | null
  hint_visible: boolean
  mic_target: string        // 'none' | 'all' | '{student_id}'
  kr_sentence: string | null
  expected_en: string | null
  hint: string | null
  lesson_duration_minutes: number
  step_durations: Record<string, number> | null
}

const STEP_TYPE_LABEL: Record<string, string> = {
  word_listen_repeat:    '단어 듣고 따라하기',
  word_k2e:              '단어 K2E',
  sentence_listen_repeat:'문장 듣고 따라하기',
  sentence_k2e:          '문장 영작',
  free_talk:             '자유 대화',
}

function StudentClassroomContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const supabase = createClient()

  const [session, setSession] = useState<ClassroomSession | null>(null)
  const [myAnswer, setMyAnswer] = useState<{ text: string; isCorrect: boolean | null; score: number | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState<string | null>(null)
  const [interimText, setInterimText] = useState('')
  const [isHolding, setIsHolding] = useState(false)

  // 마이크 활성화 정책
  const [micEnabled, setMicEnabled] = useState(true)  // 교실에서는 항상 활성화
  const [micDisabledReason, setMicDisabledReason] = useState<string>('선생님이 마이크를 활성화하면 말할 수 있어요')
  const [reaskRequested, setReaskRequested] = useState(false)  // 재발화 요청 상태

  // 교실 대화 메시지 목록
  interface ClassroomMessage { id: string; role: string; text: string; createdAt: string }
  const [classroomMessages, setClassroomMessages] = useState<ClassroomMessage[]>([])

  // 타이머
  const [stepTimeLeft, setStepTimeLeft] = useState<number | null>(null)   // 현재 스텝 남은 초
  const [totalTimeLeft, setTotalTimeLeft] = useState<number | null>(null) // 전체 수업 남은 초
  const [stepDuration, setStepDuration] = useState<number | null>(null)   // 현재 스텝 배분 시간(초)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const stepStartRef = useRef<number | null>(null)   // 현재 스텝 시작 timestamp
  const sessionStartRef = useRef<number | null>(null) // 수업 시작 timestamp

  const studentIdRef = useRef<string | null>(null)
  const sessionRef = useRef<ClassroomSession | null>(null)
  sessionRef.current = session

  // ── 마이크 활성화 정책 적용 ─────────────────────────────
  const applyMicPolicy = useCallback((micTarget: string, sid: string | null) => {
    if (micTarget === 'none') {
      setMicEnabled(false)
      setMicDisabledReason('선생님이 마이크를 활성화하면 말할 수 있어요')
    } else if (micTarget === 'all') {
      setMicEnabled(true)
      setMicDisabledReason('')
    } else if (micTarget === sid) {
      setMicEnabled(true)
      setMicDisabledReason('')
    } else {
      setMicEnabled(false)
      setMicDisabledReason('다른 친구의 차례예요')
    }
  }, [])

  // ── 타이머 시작 ────────────────────────────────────────
  const startTimer = useCallback((sess: ClassroomSession) => {
    if (timerRef.current) clearInterval(timerRef.current)
    const now = Date.now()
    stepStartRef.current = now
    if (!sessionStartRef.current) sessionStartRef.current = now

    // 스텝별 배분 시간 계산
    const totalSec = (sess.lesson_duration_minutes || 40) * 60
    const perStep = Math.floor(totalSec / (sess.total_steps || 5))
    const stepKey = String(sess.current_step)
    const thisDuration = sess.step_durations?.[stepKey] ?? perStep
    setStepDuration(thisDuration)
    setStepTimeLeft(thisDuration)

    const sessionElapsed = sessionStartRef.current
      ? Math.floor((now - sessionStartRef.current) / 1000)
      : 0
    setTotalTimeLeft(Math.max(0, totalSec - sessionElapsed))

    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - (stepStartRef.current ?? now)) / 1000)
      const sessionElapsedNow = Math.floor((Date.now() - (sessionStartRef.current ?? now)) / 1000)
      setStepTimeLeft(Math.max(0, thisDuration - elapsed))
      setTotalTimeLeft(Math.max(0, totalSec - sessionElapsedNow))
    }, 1000)
  }, [])

  const formatTime = (sec: number | null) => {
    if (sec === null) return '--:--'
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  // ── 초기화 ────────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) { router.push('/student'); return }
    init()
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [sessionId])

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setStudentId(user.id)
    studentIdRef.current = user.id

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, nickname')
      .eq('id', user.id)
      .single()
    const name = profile?.nickname || profile?.name || '학생'
    setStudentName(name)

    // 교실 참여 등록
    await supabase.from('classroom_participants').upsert({
      session_id: sessionId,
      student_id: user.id,
      student_name: name,
      joined_at: new Date().toISOString(),
      is_online: true,
    }, { onConflict: 'session_id,student_id' })

    const { data: sess } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    if (!sess) { router.push('/student'); return }
    setSession(sess)
    applyMicPolicy(sess.mic_target ?? 'none', user.id)
    startTimer(sess)

    // 학생 입장 -> conversation_logs INSERT (session_type='START')
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

  // ── Realtime: 세션 업데이트 ───────────────────────────
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel(`student_classroom:${sessionId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        const updated = payload.new as ClassroomSession
        const prev = sessionRef.current

        setSession(updated)

        // 수업 종료
        if (updated.status === 'ended') {
          if (timerRef.current) clearInterval(timerRef.current)
          alert('선생님이 수업을 종료했어요.')
          router.push('/student')
          return
        }

        // 마이크 활성화 정책
        applyMicPolicy(updated.mic_target ?? 'none', studentIdRef.current)
        setReaskRequested(false)

        // 스텝 바뀌면 답변 초기화 + 타이머 재시작
        if (prev && updated.current_step !== prev.current_step) {
          setMyAnswer(null)
          startTimer(updated)
        }
      })
      .subscribe()
    // conversation_logs Realtime 구독
    const logChannel = supabase
      .channel(`classroom_logs:${sessionId}:${studentIdRef.current}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_logs',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const log = payload.new
        // 내게 온 메시지만 처리
        if (log.target_student_id !== studentIdRef.current) return
        if (log.ai_text) {
          setClassroomMessages(prev => [...prev, {
            id: log.id,
            role: 'ai',
            text: log.ai_text,
            createdAt: log.created_at,
          }])
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_logs',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const log = payload.new
        if (log.target_student_id !== studentIdRef.current) return
        // ai_text가 UPDATE되면 메시지 추가 또는 업데이트
        if (log.ai_text) {
          // 현재 답변해야 할 row id 저장
          sessionStorage.setItem('classroomLogId', log.id)
          setClassroomMessages(prev => {
            const exists = prev.find(m => m.id === log.id)
            if (exists) {
              return prev.map(m => m.id === log.id ? { ...m, text: log.ai_text } : m)
            }
            return [...prev, { id: log.id, role: 'ai', text: log.ai_text, createdAt: log.created_at }]
          })
        }
        // student_text가 UPDATE되면 내 답변 표시
        if (log.student_text && log.student_id === studentIdRef.current) {
          setClassroomMessages(prev => {
            const exists = prev.find(m => m.id === log.id)
            if (exists) {
              return prev.map(m => m.id === log.id ? { ...m, studentText: log.student_text } : m)
            }
            return prev
          })
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(logChannel)
    }
  }, [sessionId, applyMicPolicy, startTimer])

  // ── STT 결과 처리 ─────────────────────────────────────
  const handleFinalResult = async (transcript: string) => {
    if (!transcript.trim() || !sessionId || !studentIdRef.current) return
    setIsHolding(false)
    setInterimText('')

    // 현재 열린 conversation_logs row id
    const logId = sessionStorage.getItem('classroomLogId')
    if (!logId) return

    // student_text UPDATE
    await supabase
      .from('conversation_logs')
      .update({ student_text: transcript })
      .eq('id', logId)

    // 다음 AI 메시지 대기
    sessionStorage.removeItem('classroomLogId')
  }

  // ── 재발화 요청 ───────────────────────────────────────
  const handleReaskRequest = async () => {
    if (!sessionId || !studentIdRef.current || reaskRequested) return
    setReaskRequested(true)
    // conversation_logs에 재발화 요청 기록
    await supabase.from('conversation_logs').insert({
      student_id: studentIdRef.current,
      session_type: 'classroom',
      classroom_session_id: sessionId,
      role: 'student',
      step_type: 'reask_request',
      student_text: '[재발화 요청]',
      mic_activated: false,
    })
  }

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
    if (isHolding || !micEnabled) return
    setIsHolding(true)
    await startListening()
  }

  const handleMicStop = async () => {
    if (!isHolding) return
    setIsHolding(false)
    await stopListening()
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">수업 화면 로딩 중...</p>
    </div>
  )

  const stepLabel = session?.current_step_type
    ? STEP_TYPE_LABEL[session.current_step_type] ?? session.current_step_type
    : ''
  const stepProgress = stepDuration && stepTimeLeft !== null
    ? Math.max(0, Math.min(100, ((stepDuration - stepTimeLeft) / stepDuration) * 100))
    : 0

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-slate-800 px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-xs text-slate-400">교실 수업 중</p>
            <p className="text-sm font-semibold text-white">
              Step {session?.current_step}/{session?.total_steps || 5}
              {stepLabel && <span className="ml-2 text-xs text-slate-400 font-normal">{stepLabel}</span>}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500">{APP_VERSION}</p>
            <button onClick={() => router.push('/student')} className="text-xs text-slate-500 hover:text-white transition-colors">
              나가기
            </button>
          </div>
        </div>
        {/* 타이머 바 */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-slate-400">
            <span>⏱️ {formatTime(stepTimeLeft)} / {formatTime(stepDuration)}</span>
            <span>전체 {formatTime(totalTimeLeft)} 남음</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-1000"
              style={{ width: `${stepProgress}%` }}
            />
          </div>
        </div>
      </header>

      <div className="flex-1 flex flex-col p-4 max-w-lg mx-auto w-full gap-3">

        {/* 상황 설명 */}
        {session?.coty_scene_kr && (
          <div className="bg-amber-900/20 border border-amber-700/30 rounded-2xl px-4 py-3">
            <p className="text-xs text-amber-300/70">🎭 상황</p>
            <p className="text-sm text-amber-100/90">{session.coty_scene_kr}</p>
          </div>
        )}

        {/* 한국어 문장 (sentence_k2e / word_k2e 스텝) */}
        {session?.kr_sentence && (
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-2xl px-4 py-3">
            <p className="text-xs text-blue-300/70">🇰🇷 영어로 말해보세요</p>
            <p className="text-lg text-blue-100 font-semibold mt-1">{session.kr_sentence}</p>
          </div>
        )}

        {/* Coty 메시지 */}
        {session?.coty_message && (
          <div className="bg-violet-900/30 border border-violet-700/30 rounded-2xl px-4 py-3">
            <p className="text-xs text-violet-400 mb-1">💬 Coty</p>
            <p className="text-base text-violet-200 font-medium">{session.coty_message}</p>
          </div>
        )}

        {/* 힌트 */}
        {session?.hint_visible && session?.hint && (
          <div className="bg-amber-900/30 border border-amber-700/30 rounded-2xl px-4 py-2">
            <p className="text-xs text-amber-300 mb-1">💡 힌트</p>
            <p className="text-sm text-amber-200">{session.hint}</p>
          </div>
        )}

        {/* 내 답변 */}
        <div className="flex-1 flex items-center justify-center">
          {myAnswer ? (
            <div className={cn(
              'w-full rounded-2xl px-4 py-3 border',
              myAnswer.isCorrect
                ? 'bg-emerald-900/30 border-emerald-700/30'
                : 'bg-red-900/30 border-red-700/30'
            )}>
              <p className="text-xs text-slate-400 mb-1">내 답변</p>
              <p className="text-sm text-white">"{myAnswer.text}"</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-lg">{myAnswer.isCorrect ? '✅' : '❌'}</span>
                {myAnswer.score !== null && (
                  <span className="text-xs text-slate-400">{myAnswer.score}점</span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              {interimText ? (
                <p className="text-amber-300 text-sm animate-pulse">{interimText}</p>
              ) : micEnabled ? (
                <p className="text-emerald-400 text-sm animate-pulse">🎤 마이크가 활성화됐어요!</p>
              ) : (
                <p className="text-slate-600 text-sm">{micDisabledReason}</p>
              )}
            </div>
          )}
        </div>

        {/* 교실 대화 메시지 목록 */}
        {classroomMessages.length > 0 && (
          <div className="w-full space-y-2 max-h-48 overflow-y-auto">
            {classroomMessages.map((msg) => (
              <div key={msg.id} className={cn(
                'rounded-2xl px-4 py-2 text-sm',
                msg.role === 'ai'
                  ? 'bg-violet-900/30 border border-violet-700/30 text-violet-200 mr-8'
                  : 'bg-emerald-900/30 border border-emerald-700/30 text-emerald-200 ml-8 text-right'
              )}>
                <p className="text-xs opacity-50 mb-0.5">{msg.role === 'ai' ? '💬 Coty' : '🧑 나'}</p>
                <p>{msg.text}</p>
              </div>
            ))}
          </div>
        )}

        {/* 마이크 버튼 + 재발화 요청 */}
        <div className="flex flex-col items-center gap-3 mb-4">
          <button
            onMouseDown={handleMicStart}
            onMouseUp={handleMicStop}
            onMouseLeave={() => { if (isHolding) handleMicStop() }}
            onTouchStart={(e) => { e.preventDefault(); handleMicStart() }}
            onTouchEnd={(e) => { e.preventDefault(); handleMicStop() }}
            onContextMenu={(e) => e.preventDefault()}
            disabled={!isSupported || !micEnabled}
            className={cn(
              'w-24 h-24 rounded-full flex items-center justify-center text-4xl',
              'transition-all duration-150 shadow-2xl select-none',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              micEnabled && !isHolding && 'ring-2 ring-emerald-500/60 ring-offset-2 ring-offset-slate-950',
              isHolding
                ? 'bg-gradient-to-br from-blue-400 to-blue-600 scale-110 ring-4 ring-blue-400/40'
                : micEnabled
                  ? 'bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600'
                  : 'bg-gradient-to-br from-slate-600 to-slate-700'
            )}
          >
            {isHolding ? '🎙️' : micEnabled ? '🎤' : '🔇'}
          </button>
          <p className="text-xs text-slate-500">
            {isHolding ? '손을 떼면 전송됩니다' : micEnabled ? '누르고 있는 동안 말하세요' : '대기 중'}
          </p>

          {/* 재발화 요청 버튼 */}
          {!micEnabled && !myAnswer && (
            <button
              onClick={handleReaskRequest}
              disabled={reaskRequested}
              className={cn(
                'text-xs px-4 py-2 rounded-full border transition-colors',
                reaskRequested
                  ? 'border-slate-700 text-slate-600 cursor-not-allowed'
                  : 'border-slate-600 text-slate-400 hover:border-emerald-600 hover:text-emerald-400'
              )}
            >
              {reaskRequested ? '✋ 요청 전달됨' : '✋ 다시 말하고 싶어요'}
            </button>
          )}
        </div>
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
