'use client'

import { useEffect, useState, useCallback, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { CotyAvatar } from '@/components/student/CotyAvatar'
import type { CotyState } from '@/components/student/CotyAvatar'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/version'

interface ClassroomSession {
  id: string
  class_id: string
  current_step: number
  current_step_type: string | null
  scenario_id: string | null
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

interface Participant {
  id: string
  student_id: string
  student_name: string
  joined_at: string
  is_online: boolean
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
  const sessionRef = useRef<ClassroomSession | null>(null)
  const [students, setStudents] = useState<ClassStudent[]>([])
  const [answers, setAnswers] = useState<StudentAnswer[]>([])
  const [cotyState, setCotyState] = useState<CotyState>('idle')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [participants, setParticipants] = useState<Participant[]>([])
  // conversation_logs START row로 입장한 학생 추적
  const [joinedStudents, setJoinedStudents] = useState<Set<string>>(new Set())
  const [scenario, setScenario] = useState<any>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const [pendingAnswers, setPendingAnswers] = useState<Set<string>>(new Set())
  const currentStepRef = useRef(1)
  currentStepRef.current = currentStep

  // pendingAnswers 0 되면 자동으로 다음 스텝 진행
  useEffect(() => {
    if (pendingAnswers.size === 0) return
    // 모든 학생 답변 완료
    const checkAllDone = async () => {
      if (pendingAnswers.size !== 0) return
      const allSteps = (scenario?.phases || []).flatMap((p: any) => p.steps || [])
      const nextStep = currentStepRef.current + 1
      if (nextStep > allSteps.length) {
        console.log('[교실] 모든 스텝 완료')
        return
      }
      // 3초 후 자동으로 다음 스텝 질문
      setTimeout(() => {
        setCurrentStep(nextStep)
      }, 3000)
    }
    checkAllDone()
  }, [pendingAnswers, scenario])
  // 학생별 최근 메시지
  const [studentMessages, setStudentMessages] = useState<Record<string, {role: string, text: string, id: string}[]>>({})

  const supabase = createClient()

  useEffect(() => {
    if (!sessionId) { router.push('/teacher'); return }
    loadSession()
  }, [sessionId])

  const loadSession = async () => {
    if (!sessionId) return
    const { data: sess } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    if (!sess) { router.push('/teacher'); return }
    sessionRef.current = sess
    setSession(sess)

    const { data: members } = await supabase
      .from('profiles')
      .select('id, name, nickname')
      .eq('class_id', sess.class_id)
      .eq('role', 'student')
    setStudents(members || [])

    await loadAnswers(sess.id, sess.current_step)


    // classes에서 book/unit 로드 후 시나리오 조회
    const { data: classData } = await supabase
      .from('classes')
      .select('current_book, current_unit')
      .eq('id', sess.class_id)
      .single()
    if (classData?.current_book && classData?.current_unit) {
      const res = await fetch(`/api/lesson-scenario?book=${encodeURIComponent(classData.current_book)}&unit=${classData.current_unit}`)
      if (res.ok) {
        const scenData = await res.json()
        setScenario(scenData?.scenario ?? null)
      }
    }
    // 참여 학생 로드
    const { data: parts } = await supabase
      .from('classroom_participants')
      .select('*')
      .eq('session_id', sess.id)
      .eq('is_online', true)
    setParticipants(parts || [])
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
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_logs',
        filter: `session_id=eq.${sessionId}`,
      }, async (payload) => {
        const log = payload.new
        // 학생 입장(START) 감지
        if (log.session_type === 'START' && log.student_id) {
          setJoinedStudents(prev => new Set(prev).add(log.student_id))
          const student = students.find(s => s.id === log.student_id)
          const studentName = student?.nickname || student?.name || '학생'
          await sendCotyMessage([{ id: log.student_id, name: studentName }], undefined, log.id)
        }
        // AI 메시지 업데이트 (INSERT)
        if (log.ai_text && log.target_student_id) {
          setStudentMessages(prev => {
            const arr = prev[log.target_student_id] || []
            const exists = arr.find((m: any) => m.id === log.id)
            if (exists) return { ...prev, [log.target_student_id]: arr.map((m: any) => m.id === log.id ? { ...m, text: log.ai_text } : m) }
            return { ...prev, [log.target_student_id]: [...arr, { role: 'ai', text: log.ai_text, id: log.id }] }
          })
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'classroom_participants',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const incoming = payload.new as Participant
        setParticipants(prev => {
          const exists = prev.find(p => p.student_id === incoming.student_id)
          if (exists) return prev
          return [...prev, incoming]
        })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'classroom_participants',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const incoming = payload.new as Participant
        setParticipants(prev => {
          const exists = prev.find(p => p.student_id === incoming.student_id)
          if (exists) {
            // is_online 상태 업데이트
            return prev.map(p => p.student_id === incoming.student_id ? incoming : p)
          }
          // UPDATE인데 목록에 없으면 추가 (초기 로드 타이밍 문제 대비)
          if (incoming.is_online) return [...prev, incoming]
          return prev
        })
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_logs',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const log = payload.new
        if (log.ai_text && log.target_student_id) {
          setStudentMessages(prev => {
            const arr = prev[log.target_student_id] || []
            const exists = arr.find((m: any) => m.id === log.id)
            if (exists) return { ...prev, [log.target_student_id]: arr.map((m: any) => m.id === log.id ? { ...m, text: log.ai_text } : m) }
            return { ...prev, [log.target_student_id]: [...arr, { role: 'ai', text: log.ai_text, id: log.id }] }
          })
        }
        if (log.student_text && log.student_id) {
          setStudentMessages(prev => {
            const arr = prev[log.student_id] || []
            const exists = arr.find((m: any) => m.id === log.id + '_s')
            if (exists) return prev
            return { ...prev, [log.student_id]: [...arr, { role: 'student', text: log.student_text, id: log.id + '_s' }] }
          })
          setJoinedStudents(prev => new Set(prev).add(log.student_id))
          // 답변 완료 체크
          setPendingAnswers(prev => {
            const next = new Set(prev)
            next.delete(log.student_id)
            return next
          })
          // GPT 채점 → 피드백 row INSERT
          if (scenario) {
            fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                studentText: log.student_text,
                studentId: log.student_id,
                scenarioId: scenario.id,
                nickname: students.find((s: any) => s.id === log.student_id)?.nickname
                  || students.find((s: any) => s.id === log.student_id)?.name
                  || '학생',
                progressData: { current_step: currentStep, completed_steps: [], natural_steps: [], hint_used_steps: [] },
              }),
            }).then(r => r.ok ? r.json() : null).then(data => {
              if (!data) return
              const aiText = data.message || data.text || ''
              if (!aiText) return
              fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  session_id: sessionId,
                  student_id: log.student_id,
                  target_student_id: log.student_id,
                  session_type: 'classroom',
                  ai_text: aiText,
                  score: data.feedback?.overall ?? null,
                  is_correct: data.step_completed ?? null,
                  feedback_kr: data.feedback?.pronunciation?.tip_kr || null,
                }),
              })
            }).catch(e => console.error('GPT 채점 오류:', e))
          }
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${sessionId}`,
      }, (payload) => {
        const updated = payload.new as ClassroomSession
        const prev = sessionRef.current
        sessionRef.current = updated
        setSession(updated)
        // coty_message 바뀌면 선생님 화면에서도 자동 TTS 재생
        if (updated.coty_message && updated.coty_message !== prev?.coty_message) {
          playCoty(updated.coty_message)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  // 특정 학생(또는 전체)에게 Coty 메시지 전송 → /api/log INSERT + TTS 재생
  // logId 있으면 기존 row UPDATE, 없으면 새 row INSERT
  const sendCotyMessage = async (targetStudents: {id: string, name: string}[], customText?: string, logId?: string) => {
    const currentSession = sessionRef.current
    if (!sessionId || !currentSession) {
      console.log('[sendCotyMessage] 세션 없음 - sessionId:', sessionId, 'session:', currentSession)
      return
    }
    const session = currentSession
    try {
      const firstName = targetStudents[0]?.name || '학생'
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentText: customText || `__GREETING__:${firstName}`,
          studentId: targetStudents[0]?.id || null,
          nickname: firstName,
          currentBook: 'Insight Builder 1',
        }),
      })
      const data = res.ok ? await res.json() : null
      const text = data?.message || data?.text || data?.content || `Hi ${firstName}! Welcome to class!`

      if (logId) {
        // 기존 START row에 ai_text UPDATE
        await supabase
          .from('conversation_logs')
          .update({ ai_text: text })
          .eq('id', logId)
      } else {
        // 새 row INSERT
        await Promise.all(targetStudents.map(student =>
          fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionId,
              student_id: student.id,
              target_student_id: student.id,
              session_type: 'classroom',
              ai_text: text,
              step_type: session.current_step_type || null,
            }),
          })
        ))
      }
      playCoty(text)
    } catch (e) {
      console.error('sendCotyMessage 오류:', e)
    }
  }

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

  // 시나리오 현재 스텝의 ai_line을 전체 학생에게 전송
  // currentStep 변경 시 자동으로 다음 스텝 질문
  useEffect(() => {
    if (currentStep === 1) return  // 최초 진입은 [학습 시작] 버튼으로
    if (!scenario || !sessionId || students.length === 0) return
    const allSteps = (scenario?.phases || []).flatMap((p: any) => p.steps || [])
    const stepData = allSteps[currentStep - 1]
    if (!stepData) return
    const aiLine = stepData?.ai_line || `Let's continue with step ${currentStep}!`
    // 전체 학생에게 다음 스텝 질문 INSERT
    Promise.all(students.map((student: any) =>
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          student_id: student.id,
          target_student_id: student.id,
          session_type: 'classroom',
          ai_text: aiLine,
        }),
      })
    )).then(() => {
      playCoty(aiLine)
      setPendingAnswers(new Set(students.map((s: any) => s.id)))
    })
  }, [currentStep])

  const startLesson = async () => {
    if (!sessionId || !session || students.length === 0) return
    const allSteps = (scenario?.phases || []).flatMap((p: any) => p.steps || [])
    const stepData = allSteps[currentStep - 1]
    const aiLine = stepData?.ai_line || stepData?.scene_kr || `Let's start step ${currentStep}!`
    // 전체 학생 수만큼 conversation_logs INSERT
    await Promise.all(students.map((student: any) =>
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          student_id: student.id,
          target_student_id: student.id,
          session_type: 'classroom',
          ai_text: aiLine,
        }),
      })
    ))
    playCoty(aiLine)
    setPendingAnswers(new Set(students.map((s: any) => s.id)))
  }

  const nextStep = async () => {
    if (!session) return
    const newStep = session.current_step + 1
    await supabase
      .from('sessions')
      .update({ current_step: newStep })
      .eq('id', sessionId)
    setAnswers([])
  }

  const toggleHint = async () => {
    if (!session) return
    await supabase
      .from('sessions')
      .update({ hint_visible: !session.hint_visible })
      .eq('id', sessionId)
  }

  // 브라우저 닫거나 페이지 벗어날 때 세션 자동 종료
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (sessionId) {
        navigator.sendBeacon('/api/classroom/end-session', JSON.stringify({ sessionId }))
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [sessionId])

  const endSession = async () => {
    if (!confirm('수업을 종료하시겠어요?')) return
    await supabase
      .from('sessions')
      .update({ status: 'off' })
      .eq('id', sessionId)
    router.push('/teacher')
  }

  const handleLogout = async () => {
    if (!confirm('로그아웃하면 수업이 종료됩니다. 계속할까요?')) return
    await supabase
      .from('sessions')
      .update({ status: 'off' })
      .eq('id', sessionId)
    await supabase.auth.signOut()
    router.push('/login')
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
          <p className="text-xs text-slate-600">{APP_VERSION}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-blue-400">🟢 접속: {participants.length}명</span>
          <span className="text-xs text-emerald-400">✅ {correctCount}명</span>
          <span className="text-xs text-red-400">❌ {incorrectCount}명</span>
          <span className="text-xs text-slate-400">⬜ {waitingCount}명</span>
          <button
            onClick={startLesson}
            disabled={isSpeaking || students.length === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40 transition-colors"
          >
            📚 학습 시작
          </button>
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
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
          >
            로그아웃
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

              const isOnline = joinedStudents.has(student.id)
              return (
                <div key={student.id} className={cn(
                  'bg-slate-900 border-2 rounded-2xl p-3 flex flex-col gap-2 transition-all',
                  status === 'correct' ? 'border-emerald-500/60' :
                  status === 'incorrect' ? 'border-red-500/60' :
                  isOnline ? 'border-blue-500/40' :
                  'border-slate-700'
                )}>
                  {/* 학생 이름 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={cn('w-2 h-2 rounded-full', isOnline ? 'bg-blue-400 animate-pulse' : 'bg-slate-600')} />
                      <span className="text-sm font-medium text-white">
                        {student.nickname || student.name}
                      </span>
                    </div>
                    <span className="text-lg">
                      {status === 'correct' ? '✅' : status === 'incorrect' ? '❌' : isOnline ? '🟢' : '⬜'}
                    </span>
                  </div>

                  {/* Coty 말 걸기 버튼 */}
                  {/* 대화 메시지 목록 */}
                  {(studentMessages[student.id] || []).length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {(studentMessages[student.id] || []).map((msg) => (
                        <div key={msg.id} className={cn(
                          'rounded-xl px-2 py-1.5',
                          msg.role === 'ai'
                            ? 'bg-violet-900/20 border border-violet-700/30 mr-2'
                            : 'bg-emerald-900/20 border border-emerald-700/30 ml-2 text-right'
                        )}>
                          <p className={cn('text-[10px] mb-0.5', msg.role === 'ai' ? 'text-violet-400' : 'text-emerald-400 text-right')}>
                            {msg.role === 'ai' ? '💬 Coty' : '🧑 답변'}
                          </p>
                          <p className={cn('text-xs', msg.role === 'ai' ? 'text-violet-200' : 'text-emerald-200')}>
                            {msg.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {isOnline && (
                    <button
                      onClick={() => sendCotyMessage([{id: student.id, name: student.nickname || student.name}])}
                      className="w-full py-1.5 rounded-xl text-xs bg-violet-900/40 hover:bg-violet-700/60 text-violet-300 border border-violet-700/30 transition-colors"
                    >
                      💬 Coty 인사
                    </button>
                  )}
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
