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
  const [micEnabled, setMicEnabled] = useState(false)
  const [micDisabledReason, setMicDisabledReason] = useState<string>('선생님이 마이크를 활성화하면 말할 수 있어요')
  const [reaskRequested, setReaskRequested] = useState(false)  // 재발화 요청 상태
  const [welcomePlaying, setWelcomePlaying] = useState(false)
  const [welcomeText, setWelcomeText] = useState<string | null>(null)

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
      .from('classroom_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    if (!sess) { router.push('/student'); return }
    setSession(sess)
    applyMicPolicy(sess.mic_target ?? 'none', user.id)
    startTimer(sess)
    setLoading(false)
    // 입장 직후 환영 인사 (수업 waiting/active 상태일 때만)
    if (sess.status === 'active' || sess.status === 'waiting') {
      playWelcome(name, user.id, sessionId as string)
    }
  }

  // ── Realtime: 세션 업데이트 ───────────────────────────
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel(`student_classroom:${sessionId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'classroom_sessions',
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
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, applyMicPolicy, startTimer])

  // ── STT 결과 처리 ─────────────────────────────────────
  const handleFinalResult = async (transcript: string) => {
    if (!transcript.trim() || !sessionId || !studentIdRef.current || !sessionRef.current) return
    setIsHolding(false)
    setInterimText('')
    setMicEnabled(false)  // 발화 완료 시 마이크 비활성화

    const sess = sessionRef.current
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: transcript,
          sessionId: 'classroom',
          classroomMode: true,
          step: sess.current_step,
          step_type: sess.current_step_type,
          expected_en: sess.expected_en,
          kr_sentence: sess.kr_sentence,
        }),
      })
      const data = res.ok ? await res.json() : null
      const isCorrect = data?.step_completed ? true : false
      const score = data?.feedback?.overall ?? null

      setMyAnswer({ text: transcript, isCorrect, score })

      await supabase.from('classroom_answers').insert({
        session_id: sessionId,
        student_id: studentIdRef.current,
        student_name: studentName,
        step: sess.current_step,
        step_type: sess.current_step_type,
        attempt: 1,
        student_text: transcript,
        is_correct: isCorrect,
        score,
        feedback_kr: data?.feedback?.pronunciation?.tip_kr || null,
      })
    } catch (e) {
      console.error('채점 오류:', e)
    }
  }

  // ── 환영 인사 ───────────────────────────────────────────
  const playWelcome = async (name: string, uid: string, sid: string) => {
    try {
      setWelcomePlaying(true)
      // 1) 환영 인사 텍스트 생성
      const chatRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: '[SYSTEM: Student just joined the classroom. Give a warm, short welcome greeting using their name. 1-2 sentences only. English only.]',
          sessionId: 'classroom-welcome',
          classroomMode: true,
          studentName: name,
        }),
      })
      const chatData = chatRes.ok ? await chatRes.json() : null
      const greeting = chatData?.content || `Hi ${name}! Welcome to class! Are you ready?`
      setWelcomeText(greeting)
      // classroom_sessions.coty_message 업데이트 -> 선생님 화면 Realtime 반영
      await supabase
        .from('classroom_sessions')
        .update({ coty_message: greeting, updated_at: new Date().toISOString() })
        .eq('id', sid)

      // 2) TTS 음성 생성 및 재생
      const ttsRes = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: greeting, speed: 'normal' }),
      })
      if (ttsRes.ok) {
        const blob = await ttsRes.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.onended = async () => {
          URL.revokeObjectURL(url)
          setWelcomePlaying(false)
          // 3) 인사 후 해당 학생 마이크 활성화
          await supabase
            .from('classroom_sessions')
            .update({ mic_target: uid })
            .eq('id', sid)
        }
        audio.play().catch(() => setWelcomePlaying(false))
      } else {
        setWelcomePlaying(false)
      }
    } catch (e) {
      console.error('환영 인사 오류:', e)
      setWelcomePlaying(false)
    }
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
        {/* 환영 인사 말풍선 */}
        {(welcomeText !== null || welcomePlaying) && (
          <div className="bg-violet-900/30 border border-violet-700/30 rounded-2xl px-4 py-3">
            <p className="text-xs text-violet-400 mb-1">💬 Coty {welcomePlaying ? '🔊' : ''}</p>
            <p className="text-base text-violet-200 font-medium">{welcomeText ?? '...'}</p>
          </div>
        )}

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
