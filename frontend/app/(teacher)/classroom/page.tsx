'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { CotyAvatar } from '@/components/student/CotyAvatar'
import type { CotyState } from '@/components/student/CotyAvatar'
import { cn } from '@/lib/utils'

interface ClassroomSession {
  id: string
  class_id: string
  current_step: number
  status: string
  coty_message: string | null
  coty_scene_kr: string | null
  hint_visible: boolean
}

interface StudentAnswer {
  id: string
  student_id: string
  student_name: string
  step: number
  attempt: number
  student_text: string | null
  is_correct: boolean | null
  score: number | null
  feedback_kr: string | null
  created_at: string
}

interface ClassStudent {
  id: string
  name: string
  nickname: string | null
}

function ClassroomContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')

  const [session, setSession] = useState<ClassroomSession | null>(null)
  const [students, setStudents] = useState<ClassStudent[]>([])
  const [answers, setAnswers] = useState<StudentAnswer[]>([])
  const [cotyState, setCotyState] = useState<CotyState>('idle')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [loading, setLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    if (!sessionId) { router.push('/teacher'); return }
    loadSession()
  }, [sessionId])

  const loadSession = async () => {
    if (!sessionId) return
    const { data: sess } = await supabase
      .from('classroom_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    if (!sess) { router.push('/teacher'); return }
    setSession(sess)

    const { data: members } = await supabase
      .from('profiles')
      .select('id, name, nickname')
      .eq('class_id', sess.class_id)
      .eq('role', 'student')
    setStudents(members || [])

    await loadAnswers(sess.id, sess.current_step)
    setLoading(false)
  }

  const loadAnswers = async (sid: string, step: number) => {
    const { data } = await supabase
      .from('classroom_answers')
      .select('*')
      .eq('session_id', sid)
      .eq('step', step)
      .order('created_at', { ascending: true })
    setAnswers(data || [])
  }

  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel(`classroom:${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'classroom_answers',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        setAnswers(prev => {
          const exists = prev.find(a => a.id === payload.new.id)
          if (exists) return prev
          return [...prev, payload.new as StudentAnswer]
        })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'classroom_sessions',
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        setSession(payload.new as ClassroomSession)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  const playCoty = useCallback(async (text: string) => {
    if (isSpeaking) return
    setIsSpeaking(true)
    setCotyState('speaking')
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'nova' }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        await new Promise<void>((resolve) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve() }
          audio.onerror = () => resolve()
          audio.play().catch(() => resolve())
        })
      }
    } finally {
      setIsSpeaking(false)
      setCotyState('idle')
    }
  }, [isSpeaking])

  const nextStep = async () => {
    if (!session) return
    const newStep = session.current_step + 1
    await supabase
      .from('classroom_sessions')
      .update({ current_step: newStep, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
    setAnswers([])
  }

  const toggleHint = async () => {
    if (!session) return
    await supabase
      .from('classroom_sessions')
      .update({ hint_visible: !session.hint_visible, updated_at: new Date().toISOString() })
      .eq('id', sessionId)
  }

  const endSession = async () => {
    if (!confirm('수업을 종료하시겠어요?')) return
    await supabase
      .from('classroom_sessions')
      .update({ status: 'ended', updated_at: new Date().toISOString() })
      .eq('id', sessionId)
    router.push('/teacher')
  }

  const getStudentAnswer = (studentId: string) => {
    const studentAnswers = answers.filter(a => a.student_id === studentId)
    return studentAnswers.length > 0 ? studentAnswers[studentAnswers.length - 1] : null
  }

  const correctCount = students.filter(s => getStudentAnswer(s.id)?.is_correct === true).length
  const incorrectCount = students.filter(s => getStudentAnswer(s.id)?.is_correct === false).length
  const waitingCount = students.filter(s => !getStudentAnswer(s.id)).length

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">수업 화면 로딩 중...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-slate-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-xl">🏫</span>
          <div>
            <h1 className="font-bold text-white text-sm">교실 수업</h1>
            <p className="text-xs text-slate-400">Step {session?.current_step}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-emerald-400">✅ {correctCount}명</span>
          <span className="text-xs text-red-400">❌ {incorrectCount}명</span>
          <span className="text-xs text-slate-400">⬜ {waitingCount}명</span>
          <button
            onClick={toggleHint}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              session?.hint_visible ? 'bg-amber-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
            )}
          >
            💡 힌트
          </button>
          <button
            onClick={nextStep}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
          >
            다음 스텝 →
          </button>
          <button
            onClick={endSession}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-900/60 hover:bg-red-700 text-red-300 hover:text-white transition-colors"
          >
            수업 종료
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 왼쪽: Coty 아바타 */}
        <div className="w-[280px] shrink-0 border-r border-slate-800 flex flex-col items-center justify-center p-4 gap-3">
          <div className="text-xs text-pink-400 font-medium">✨ Coty 선생님</div>
          <div className="w-full max-w-[220px]">
            <CotyAvatar state={cotyState} />
          </div>
          {session?.coty_message && (
            <div className="w-full">
              <div className="bg-violet-900/30 border border-violet-700/30 rounded-xl p-3">
                <p className="text-xs text-violet-300">{session.coty_message}</p>
                {session.coty_scene_kr && (
                  <p className="text-[10px] text-amber-300/70 mt-1">{session.coty_scene_kr}</p>
                )}
              </div>
              <button
                onClick={() => session.coty_message && playCoty(session.coty_message)}
                disabled={isSpeaking}
                className="mt-2 w-full py-2 rounded-xl text-xs bg-slate-700 hover:bg-slate-600 disabled:opacity-40 transition-colors"
              >
                🔊 다시 재생
              </button>
            </div>
          )}
        </div>

        {/* 오른쪽: 학생 그리드 */}
        <div className="flex-1 p-4 overflow-y-auto">
          <div className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(${Math.min(students.length, 4)}, 1fr)` }}
          >
            {students.map((student) => {
              const answer = getStudentAnswer(student.id)
              const status = !answer ? 'waiting'
                : answer.is_correct ? 'correct'
                : 'incorrect'

              return (
                <div key={student.id} className={cn(
                  'bg-slate-900 border-2 rounded-2xl p-3 flex flex-col gap-2 transition-all',
                  status === 'correct' ? 'border-emerald-500/60' :
                  status === 'incorrect' ? 'border-red-500/60' :
                  'border-slate-700'
                )}>
                  {/* 학생 이름 */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">
                      {student.nickname || student.name}
                    </span>
                    <span className="text-lg">
                      {status === 'correct' ? '✅' : status === 'incorrect' ? '❌' : '⬜'}
                    </span>
                  </div>

                  {/* 답변 내용 */}
                  {answer ? (
                    <div className="space-y-1">
                      <p className="text-xs text-emerald-200 bg-slate-800 rounded-lg px-2 py-1.5">
                        "{answer.student_text}"
                      </p>
                      <div className="flex items-center gap-2">
                        {answer.score !== null && (
                          <span className="text-[10px] text-slate-400">{answer.score}점</span>
                        )}
                        {answer.attempt > 1 && (
                          <span className="text-[10px] text-amber-400">{answer.attempt}회 시도</span>
                        )}
                      </div>
                      {answer.feedback_kr && (
                        <p className="text-[10px] text-slate-500">{answer.feedback_kr}</p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-4">
                      <p className="text-xs text-slate-600">대기 중...</p>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ClassroomPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">로딩 중...</p>
      </div>
    }>
      <ClassroomContent />
    </Suspense>
  )
}
