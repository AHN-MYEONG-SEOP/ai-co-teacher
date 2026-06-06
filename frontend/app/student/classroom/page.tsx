'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useWebSpeech } from '@/hooks/useWebSpeech'
import { useMediaRecorder } from '@/hooks/useMediaRecorder'
import { cn } from '@/lib/utils'

interface ClassroomSession {
  id: string
  current_step: number
  status: string
  coty_message: string | null
  coty_scene_kr: string | null
  hint_visible: boolean
}

function StudentClassroomContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')

  const [session, setSession] = useState<ClassroomSession | null>(null)
  const [myAnswer, setMyAnswer] = useState<{ text: string; isCorrect: boolean | null; score: number | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState<string | null>(null)
  const [interimText, setInterimText] = useState('')
  const [isHolding, setIsHolding] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (!sessionId) { router.push('/student'); return }
    init()
  }, [sessionId])

  const init = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setStudentId(user.id)

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, nickname')
      .eq('id', user.id)
      .single()
    const name = profile?.nickname || profile?.name || '학생'
    setStudentName(name)

    // 교실 참여 등록
    await supabase
      .from('classroom_participants')
      .upsert({
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
    setLoading(false)
  }

  // Realtime: 세션 업데이트 감지 (Step 변경, 힌트, 수업 종료)
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
        setSession(updated)
        if (updated.status === 'ended') {
          alert('선생님이 수업을 종료했어요.')
          router.push('/student')
        }
        // Step 바뀌면 내 답변 초기화
        if (session && updated.current_step !== session.current_step) {
          setMyAnswer(null)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, session?.current_step])

  // STT 결과 처리
  const handleFinalResult = async (transcript: string) => {
    if (!transcript.trim() || !sessionId || !studentId || !session) return
    setIsHolding(false)
    setInterimText('')

    // GPT로 채점
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: transcript,
          sessionId: 'classroom',
          classroomMode: true,
          step: session.current_step,
        }),
      })
      const data = res.ok ? await res.json() : null
      const isCorrect = data?.step_completed ? true : false
      const score = data?.feedback?.overall ?? null

      setMyAnswer({ text: transcript, isCorrect, score })

      // 답변 저장
      await supabase.from('classroom_answers').insert({
        session_id: sessionId,
        student_id: studentId,
        student_name: studentName,
        step: session.current_step,
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

  const { startRecording, discardBlob } = useMediaRecorder({
    onBlobReady: () => {},
  })

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

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400">교실 수업 중</p>
          <p className="text-sm font-medium text-white">Step {session?.current_step}</p>
        </div>
        <button
          onClick={() => router.push('/student')}
          className="text-xs text-slate-500 hover:text-white transition-colors"
        >
          나가기
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center justify-between p-4 max-w-lg mx-auto w-full">

        {/* Coty 질문 */}
        <div className="w-full space-y-3 mt-4">
          {session?.coty_scene_kr && (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-2xl px-4 py-3">
              <p className="text-xs text-amber-300/70">🎭 상황</p>
              <p className="text-sm text-amber-100/90">{session.coty_scene_kr}</p>
            </div>
          )}
          {session?.coty_message && (
            <div className="bg-violet-900/30 border border-violet-700/30 rounded-2xl px-4 py-3">
              <p className="text-xs text-violet-400 mb-1">💬 Coty</p>
              <p className="text-base text-violet-200 font-medium">{session.coty_message}</p>
            </div>
          )}
          {session?.hint_visible && (
            <div className="bg-amber-900/30 border border-amber-700/30 rounded-2xl px-4 py-2">
              <p className="text-xs text-amber-300">💡 선생님이 힌트를 보냈어요!</p>
            </div>
          )}
        </div>

        {/* 내 답변 */}
        <div className="w-full my-4">
          {myAnswer ? (
            <div className={cn(
              'rounded-2xl px-4 py-3 border',
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
            <div className="text-center py-8">
              {interimText ? (
                <p className="text-amber-300 text-sm animate-pulse">{interimText}</p>
              ) : (
                <p className="text-slate-600 text-sm">마이크를 눌러 답변하세요</p>
              )}
            </div>
          )}
        </div>

        {/* 마이크 버튼 */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <button
            onMouseDown={handleMicStart}
            onMouseUp={handleMicStop}
            onMouseLeave={() => { if (isHolding) handleMicStop() }}
            onTouchStart={(e) => { e.preventDefault(); handleMicStart() }}
            onTouchEnd={(e) => { e.preventDefault(); handleMicStop() }}
            onContextMenu={(e) => e.preventDefault()}
            disabled={!isSupported}
            className={cn(
              'w-24 h-24 rounded-full flex items-center justify-center text-4xl',
              'transition-all duration-150 shadow-2xl select-none',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              isHolding
                ? 'bg-gradient-to-br from-blue-400 to-blue-600 scale-110 ring-4 ring-blue-400/40'
                : 'bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600'
            )}
          >
            {isHolding ? '🎙️' : '🎤'}
          </button>
          <p className="text-xs text-slate-500">
            {isHolding ? '손을 떼면 전송됩니다' : '누르고 있는 동안 말하세요'}
          </p>
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
