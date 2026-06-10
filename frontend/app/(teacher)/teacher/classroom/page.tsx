'use client'
import { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useConversation, type LessonScenario, type StepProgress } from '@/hooks/useConversation'
import { useWebSpeech } from '@/hooks/useWebSpeech'
import { useMediaRecorder } from '@/hooks/useMediaRecorder'
import { useUIStore } from '@/store/uiStore'
import { CotyAvatar, type CotyState } from '@/components/student/CotyAvatar'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/version'
import type { ConversationMessage } from '@/types'

// ── 학생 1명의 수업 창 ────────────────────────────────
interface StudentPanelProps {
  studentId: string
  studentName: string
  sessionId: string
  scenario: LessonScenario | null
  progressId: string | null
}

function StudentPanel({ studentId, studentName, sessionId, scenario, progressId }: StudentPanelProps) {
  const supabase = createClient()
  const { messages, addMessage, clearMessages } = useUIStore()
  const [localMessages, setLocalMessages] = useState<ConversationMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [isHolding, setIsHolding] = useState(false)
  const [interimText, setInterimText] = useState('')

  // 자동 스크롤
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [localMessages])

  // conversation_logs Realtime 구독 (이 학생 메시지만)
  useEffect(() => {
    if (!sessionId || !studentId) return
    const channel = supabase
      .channel(`student_panel:${sessionId}:${studentId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_logs',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const log = payload.new
        if (log.target_student_id !== studentId) return
        if (log.ai_text) {
          setLocalMessages(prev => {
            if (prev.find(m => m.id === log.id)) return prev
            return [...prev, {
              id: log.id,
              role: 'ai' as const,
              content: log.ai_text,
              createdAt: log.created_at || new Date().toISOString(),
            }]
          })
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_logs',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const log = payload.new
        if (log.target_student_id !== studentId && log.student_id !== studentId) return
        // AI 메시지 업데이트
        if (log.ai_text && log.target_student_id === studentId) {
          setLocalMessages(prev => {
            const exists = prev.find(m => m.id === log.id)
            if (exists) return prev.map(m => m.id === log.id ? { ...m, content: log.ai_text } : m)
            return [...prev, {
              id: log.id,
              role: 'ai' as const,
              content: log.ai_text,
              createdAt: log.created_at || new Date().toISOString(),
            }]
          })
        }
        // 학생 답변
        if (log.student_text && log.student_id === studentId) {
          setLocalMessages(prev => {
            const sid = log.id + '_s'
            if (prev.find(m => m.id === sid)) return prev
            return [...prev, {
              id: sid,
              role: 'student' as const,
              content: log.student_text,
              createdAt: log.created_at || new Date().toISOString(),
              feedback: log.score != null ? {
                grammar: log.grammar ?? 0,
                overall: log.score ?? 0,
                correction: null,
                tip: log.feedback_kr || null,
              } : undefined,
            }]
          })
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, studentId])

  // STT 결과 처리
  const handleFinalResult = useCallback(async (transcript: string) => {
    if (!transcript.trim() || !sessionId || !studentId) return
    setIsHolding(false)
    setInterimText('')
    const logId = sessionStorage.getItem(`classroomLogId_${studentId}`)
    if (!logId) return
    sessionStorage.removeItem(`classroomLogId_${studentId}`)
    await supabase
      .from('conversation_logs')
      .update({ student_text: transcript })
      .eq('id', logId)
  }, [sessionId, studentId])

  const { startRecording } = useMediaRecorder({ onBlobReady: () => {} })
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
    const logId = sessionStorage.getItem(`classroomLogId_${studentId}`)
    if (!logId) return
    setIsHolding(true)
    await startListening()
  }

  const handleMicStop = async () => {
    if (!isHolding) return
    setIsHolding(false)
    await stopListening()
  }

  const hasLogId = !!sessionStorage.getItem(`classroomLogId_${studentId}`)

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
      {/* 학생 이름 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-sm font-medium text-white">{studentName}</span>
        </div>
        {/* 마이크 버튼 */}
        <button
          onMouseDown={handleMicStart}
          onMouseUp={handleMicStop}
          onMouseLeave={() => { if (isHolding) handleMicStop() }}
          onTouchStart={(e) => { e.preventDefault(); handleMicStart() }}
          onTouchEnd={(e) => { e.preventDefault(); handleMicStop() }}
          disabled={!isSupported}
          className={cn(
            'w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all',
            isHolding ? 'bg-red-500 scale-110' : hasLogId ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-slate-700 opacity-50'
          )}
        >
          {isHolding ? '🎙️' : '🎤'}
        </button>
      </div>

      {/* 메시지 목록 */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {localMessages.length === 0 && (
          <p className="text-xs text-slate-600 text-center pt-4">대기 중...</p>
        )}
        {localMessages.map(msg => (
          <div key={msg.id} className={cn('flex', msg.role === 'ai' ? 'justify-start' : 'justify-end')}>
            <div className={cn(
              'max-w-[85%] rounded-xl px-3 py-2 text-xs',
              msg.role === 'ai'
                ? 'bg-violet-900/30 border border-violet-700/30'
                : 'bg-emerald-900/30 border border-emerald-700/30'
            )}>
              <p className={msg.role === 'ai' ? 'text-violet-200' : 'text-emerald-200'}>
                {msg.content}
              </p>
              {msg.feedback && (
                <p className="text-[10px] text-amber-400 mt-1">
                  점수: {msg.feedback.overall}점
                </p>
              )}
            </div>
          </div>
        ))}
        {interimText && (
          <div className="flex justify-end">
            <div className="bg-slate-800 rounded-xl px-3 py-2 max-w-[85%]">
              <p className="text-xs text-slate-400 italic">{interimText}...</p>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  )
}

// ── 선생님 수업화면 메인 ──────────────────────────────
function TeacherClassroomContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const supabase = createClient()

  const [session, setSession] = useState<any>(null)
  const [students, setStudents] = useState<{ id: string; name: string; nickname: string | null }[]>([])
  const [scenario, setScenario] = useState<LessonScenario | null>(null)
  const [studentProgressIds, setStudentProgressIds] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [cotyState, setCotyState] = useState<CotyState>('idle')
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const currentStepRef = useRef(1)
  currentStepRef.current = currentStep
  const [pendingAnswers, setPendingAnswers] = useState<Set<string>>(new Set())
  const [lessonStarted, setLessonStarted] = useState(false)
  const [joinedStudents, setJoinedStudents] = useState<Set<string>>(new Set())
  const [statusLogs, setStatusLogs] = useState<string[]>([])
  const [debugOpen, setDebugOpen] = useState(true)

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setStatusLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 30))
  }

  // ── 초기화 ────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) { router.push('/teacher'); return }
    loadSession()
  }, [sessionId])

  const loadSession = async () => {
    if (!sessionId) return
    const { data: sess } = await supabase.from('sessions').select('*').eq('id', sessionId).single()
    if (!sess) { router.push('/teacher'); return }
    setSession(sess)

    const { data: members } = await supabase
      .from('profiles')
      .select('id, name, nickname')
      .eq('class_id', sess.class_id)
      .eq('role', 'student')
    setStudents(members || [])
    addLog(`👥 학생 ${(members || []).length}명 로드 완료`)

    const { data: classData } = await supabase
      .from('classes')
      .select('current_book, current_unit')
      .eq('id', sess.class_id)
      .maybeSingle()
    if (classData?.current_book && classData?.current_unit) {
      try {
        const res = await fetch(`/api/lesson-scenario?book=${encodeURIComponent(classData.current_book)}&unit=${classData.current_unit}`)
        const data = res.ok ? await res.json() : null
        const scen = data?.scenario ?? null
        setScenario(scen)
        if (scen) addLog(`✅ 시나리오: ${scen.title} (${scen.total_steps}스텝)`)
        else addLog(`❌ 시나리오 없음: ${classData.current_book} Unit ${classData.current_unit}`)
      } catch (e) { addLog(`❌ 시나리오 로드 오류`) }
    } else {
      addLog(`⚠️ 교재 미설정`)
    }
    setLoading(false)
  }

  // ── Realtime 구독 ─────────────────────────────────
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel(`teacher_classroom:${sessionId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_logs',
        filter: `session_id=eq.${sessionId}`,
      }, async (payload) => {
        const log = payload.new
        if (log.session_type === 'START' && log.student_id) {
          setJoinedStudents(prev => new Set(prev).add(log.student_id))
          const student = students.find(s => s.id === log.student_id)
          const name = student?.nickname || student?.name || '학생'
          addLog(`🟢 ${name} 입장`)
          // lesson_progress INSERT
          if (scenario) {
            const today = new Date().toISOString().split('T')[0]
            const { data: progRows } = await supabase
              .from('lesson_progress')
              .select('attempt')
              .eq('student_id', log.student_id)
              .eq('scenario_id', scenario.id)
              .order('attempt', { ascending: false })
              .limit(1)
            const nextAttempt = (progRows?.[0]?.attempt ?? 0) + 1
            const { data: newProg } = await supabase
              .from('lesson_progress')
              .insert({
                student_id: log.student_id,
                scenario_id: scenario.id,
                session_date: today,
                attempt: nextAttempt,
                current_step: 1,
                completed_steps: [],
                natural_steps: [],
                hint_used_steps: [],
                completed: false,
              })
              .select('id')
              .single()
            if (newProg) setStudentProgressIds(prev => ({ ...prev, [log.student_id]: newProg.id }))
          }
          await sendCotyMessage([{ id: log.student_id, name }], undefined, log.id)
        }
        // logId 저장 (학생 마이크 활성화용)
        if (log.target_student_id) {
          sessionStorage.setItem(`classroomLogId_${log.target_student_id}`, log.id)
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_logs',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const log = payload.new
        // logId 업데이트
        if (log.ai_text && log.target_student_id) {
          sessionStorage.setItem(`classroomLogId_${log.target_student_id}`, log.id)
        }
        // 학생 답변 감지 → GPT 채점
        if (log.student_text && log.student_id) {
          const student = students.find(s => s.id === log.student_id)
          addLog(`💬 ${student?.nickname || student?.name || '학생'} 답변: "${log.student_text.slice(0, 20)}..."`)
          setPendingAnswers(prev => {
            const next = new Set(prev)
            next.delete(log.student_id)
            return next
          })
          if (scenario) {
            fetch('/api/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                studentText: log.student_text,
                studentId: log.student_id,
                scenarioId: scenario.id,
                progressId: studentProgressIds[log.student_id] || null,
                nickname: student?.nickname || student?.name || '학생',
                progressData: { current_step: currentStepRef.current, completed_steps: [], natural_steps: [], hint_used_steps: [] },
              }),
            }).then(r => r.ok ? r.json() : null).then(data => {
              if (!data?.message) return
              addLog(`🤖 GPT 피드백 생성 완료`)
              fetch('/api/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  session_id: sessionId,
                  student_id: log.student_id,
                  target_student_id: log.student_id,
                  session_type: 'classroom',
                  ai_text: data.message,
                  score: data.feedback?.overall ?? null,
                  is_correct: data.step_completed ? true : null,
                  feedback_kr: data.feedback?.pronunciation?.tip_kr || null,
                }),
              })
            }).catch(e => addLog(`❌ GPT 채점 오류: ${e.message}`))
          }
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, students, scenario, studentProgressIds])

  // ── pendingAnswers 완료 → 다음 스텝 ──────────────
  useEffect(() => {
    if (!lessonStarted || pendingAnswers.size > 0) return
    const allSteps = (scenario?.phases || []).flatMap((p: any) => p.steps || [])
    const nextStep = currentStepRef.current + 1
    if (nextStep > allSteps.length) { addLog('🎉 모든 스텝 완료!'); return }
    const timer = setTimeout(() => {
      addLog(`⏭️ 3초 후 Step ${nextStep} 진행`)
      setCurrentStep(nextStep)
    }, 3000)
    return () => clearTimeout(timer)
  }, [pendingAnswers, lessonStarted, scenario])

  // ── currentStep 변경 → 질문 전송 ─────────────────
  useEffect(() => {
    if (!lessonStarted || currentStep === 1) return
    sendStepQuestion(currentStep)
  }, [currentStep])

  // ── TTS ───────────────────────────────────────────
  const playCoty = async (text: string) => {
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
        audio.onended = () => { setIsSpeaking(false); setCotyState('idle'); URL.revokeObjectURL(url) }
        audio.play()
      }
    } catch { setIsSpeaking(false); setCotyState('idle') }
  }

  // ── Coty 메시지 전송 ─────────────────────────────
  const sendCotyMessage = async (targets: { id: string; name: string }[], customText?: string, logId?: string) => {
    if (!sessionId) return
    try {
      const firstName = targets[0]?.name || '학생'
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentText: customText || `__GREETING__:${firstName}`,
          studentId: targets[0]?.id || null,
          nickname: firstName,
        }),
      })
      const data = res.ok ? await res.json() : null
      const text = data?.message || `Hi ${firstName}! Welcome to class!`
      if (logId) {
        await supabase.from('conversation_logs').update({ ai_text: text }).eq('id', logId)
      } else {
        await Promise.all(targets.map(t =>
          fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              session_id: sessionId,
              student_id: t.id,
              target_student_id: t.id,
              session_type: 'classroom',
              ai_text: text,
            }),
          })
        ))
      }
      playCoty(text)
    } catch (e: any) { addLog(`❌ sendCotyMessage 오류: ${e.message}`) }
  }

  // ── 스텝 질문 전송 ───────────────────────────────
  const sendStepQuestion = async (step: number) => {
    if (!sessionId || !scenario || students.length === 0) return
    const allSteps = (scenario?.phases || []).flatMap((p: any) => p.steps || [])
    const stepData = allSteps[step - 1]
    if (!stepData) return
    const aiLine = (stepData?.ai_line || `Step ${step}!`).replace(/{{nickname}}/g, '여러분')
    addLog(`📢 Step ${step} 질문: "${aiLine.slice(0, 30)}..."`)
    await Promise.all(students.map(s =>
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          student_id: s.id,
          target_student_id: s.id,
          session_type: 'classroom',
          ai_text: aiLine,
        }),
      })
    ))
    playCoty(aiLine)
    setPendingAnswers(new Set(students.map(s => s.id)))
  }

  // ── 학습 시작 ────────────────────────────────────
  const startLesson = async () => {
    if (!sessionId || !session || !scenario) {
      addLog(`❌ 학습 시작 실패 — scenario: ${!!scenario}`)
      return
    }
    const today = new Date().toISOString().split('T')[0]
    const { data: progRows } = await supabase
      .from('lesson_progress')
      .select('attempt')
      .eq('class_id', session.class_id)
      .eq('scenario_id', scenario.id)
      .order('attempt', { ascending: false })
      .limit(1)
    const nextAttempt = (progRows?.[0]?.attempt ?? 0) + 1
    const { data: newProg } = await supabase
      .from('lesson_progress')
      .insert({
        student_id: null,
        class_id: session.class_id,
        scenario_id: scenario.id,
        session_date: today,
        attempt: nextAttempt,
        current_step: 1,
        completed_steps: [],
        natural_steps: [],
        hint_used_steps: [],
        completed: false,
      })
      .select('id')
      .single()
    if (newProg) {
      const ids: Record<string, string> = {}
      students.forEach(s => { ids[s.id] = newProg.id })
      setStudentProgressIds(ids)
    }
    setLessonStarted(true)
    addLog(`🚀 학습 시작 — ${scenario.title} (${students.length}명)`)
    await sendStepQuestion(1)
  }

  const endSession = async () => {
    if (!confirm('수업을 종료하시겠어요?')) return
    await supabase.from('sessions').update({ status: 'off' }).eq('id', sessionId)
    router.push('/teacher')
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">로딩 중...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-slate-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="scale-50 origin-left">
            <CotyAvatar state={cotyState} />
          </div>
          <div>
            <h1 className="text-sm font-bold">AI Co-Teacher 수업</h1>
            <p className="text-xs text-slate-400">Step {currentStep} · {APP_VERSION}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-400">🟢 {joinedStudents.size}/{students.length}명</span>
          <button
            onClick={startLesson}
            disabled={isSpeaking || lessonStarted || !scenario}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white transition-colors"
          >
            {lessonStarted ? '📚 수업 중' : !scenario ? '⏳ 로딩 중' : '📚 학습 시작'}
          </button>
          <button onClick={endSession} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-900/60 hover:bg-red-700 text-red-300 transition-colors">
            🔚 수업 종료
          </button>
        </div>
      </header>

      {/* 본문 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 학생 그리드 */}
        <div className="flex-1 p-4 overflow-y-auto">
          {students.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-slate-500">이 반에 등록된 학생이 없습니다</p>
            </div>
          ) : (
            <div
              className="grid gap-3 h-full"
              style={{ gridTemplateColumns: `repeat(${Math.min(students.length, 4)}, 1fr)` }}
            >
              {students.map(student => (
                <StudentPanel
                  key={student.id}
                  studentId={student.id}
                  studentName={student.nickname || student.name}
                  sessionId={sessionId!}
                  scenario={scenario}
                  progressId={studentProgressIds[student.id] || null}
                />
              ))}
            </div>
          )}
        </div>

        {/* 오른쪽: 디버그 패널 */}
        <div className="hidden lg:flex flex-col w-[280px] shrink-0 border-l border-slate-800 bg-slate-950">
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-800 border-b border-slate-800"
            onClick={() => setDebugOpen(prev => !prev)}
          >
            <p className="text-[11px] text-slate-400 font-bold">🔍 디버그 패널</p>
            <span className="text-slate-500 text-xs">{debugOpen ? '◀ 닫기' : '▶ 열기'}</span>
          </div>
          {debugOpen && (
            <div className="flex-1 overflow-y-auto p-3 space-y-1 text-[11px]">
              <p className="text-slate-500 font-bold">── sessions ──</p>
              <div className="flex justify-between"><span className="text-slate-400">sessionId</span><span className="text-white font-mono truncate max-w-[160px]">{sessionId}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">status</span><span className="text-white font-mono">{session?.status}</span></div>
              <p className="text-slate-500 font-bold mt-2">── 수업 상태 ──</p>
              <div className="flex justify-between"><span className="text-slate-400">scenario</span><span className={scenario ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>{scenario ? `✅ ${scenario.title}` : '❌ null'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">currentStep</span><span className="text-white font-mono">{currentStep}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">lessonStarted</span><span className={lessonStarted ? 'text-emerald-400' : 'text-slate-400'}>{lessonStarted ? '✅' : 'false'}</span></div>
              <div className="flex justify-between"><span className="text-slate-400">students</span><span className="text-white font-mono">{students.length}명</span></div>
              <div className="flex justify-between"><span className="text-slate-400">joined</span><span className="text-white font-mono">{joinedStudents.size}명</span></div>
              <div className="flex justify-between"><span className="text-slate-400">pending</span><span className="text-white font-mono">{pendingAnswers.size}명</span></div>
              <p className="text-slate-500 font-bold mt-2">── 상태 로그 ──</p>
              {statusLogs.map((log, i) => (
                <p key={i} className="text-slate-400 text-[10px] leading-relaxed">{log}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TeacherClassroomPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400">로딩 중...</p>
      </div>
    }>
      <TeacherClassroomContent />
    </Suspense>
  )
}
