'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { CotyAvatar, type CotyState } from '@/components/student/CotyAvatar'
import { cn } from '@/lib/utils'
import { APP_VERSION } from '@/lib/version'

// ── 타입 ─────────────────────────────────────────────
interface ClassroomSession {
  id: string
  class_id: string
  status: string
}
interface ClassStudent {
  id: string
  name: string
  nickname: string | null
}
interface ChatMessage {
  id: string
  role: 'ai' | 'student'
  text: string
}

// ── 메인 컴포넌트 ─────────────────────────────────────
function ClassroomContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session')
  const supabase = createClient()

  // ── State ─────────────────────────────────────────
  const [session, setSession] = useState<ClassroomSession | null>(null)
  const sessionRef = useRef<ClassroomSession | null>(null)
  const [students, setStudents] = useState<ClassStudent[]>([])
  const [loading, setLoading] = useState(true)
  const [cotyState, setCotyState] = useState<CotyState>('idle')
  const [isSpeaking, setIsSpeaking] = useState(false)

  // 수업 진행 상태
  const [scenario, setScenario] = useState<any>(null)
  const [currentStep, setCurrentStep] = useState(1)
  const currentStepRef = useRef(1)
  currentStepRef.current = currentStep
  const [pendingAnswers, setPendingAnswers] = useState<Set<string>>(new Set())
  const [studentProgressIds, setStudentProgressIds] = useState<Record<string, string>>({})
  const [lessonStarted, setLessonStarted] = useState(false)
  const [debugOpen, setDebugOpen] = useState(true)
  const [statusLogs, setStatusLogs] = useState<string[]>([])
  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setStatusLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 20))
  }

  // 학생별 메시지 (배열)
  const [studentMessages, setStudentMessages] = useState<Record<string, ChatMessage[]>>({})
  // 입장한 학생 추적
  const [joinedStudents, setJoinedStudents] = useState<Set<string>>(new Set())

  // ── 초기화 ────────────────────────────────────────
  useEffect(() => {
    if (!sessionId) { router.push('/teacher'); return }
    loadSession()
  }, [sessionId])

  const loadSession = async () => {
    if (!sessionId) return
    // 세션 조회
    const { data: sess } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    if (!sess) { router.push('/teacher'); return }
    sessionRef.current = sess
    setSession(sess)

    // 반 학생 목록
    const { data: members } = await supabase
      .from('profiles')
      .select('id, name, nickname')
      .eq('class_id', sess.class_id)
      .eq('role', 'student')
    setStudents(members || [])

    // 시나리오 로드 (자습화면 방식과 동일)
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
        if (scen) {
          setStatusLogs(prev => {
            const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            return [`[${time}] ✅ 시나리오 로드: ${scen.title} (${scen.total_steps}스텝)`, ...prev].slice(0, 20)
          })
        } else {
          setStatusLogs(prev => {
            const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            return [`[${time}] ❌ 시나리오 없음: ${classData.current_book} Unit ${classData.current_unit}`, ...prev].slice(0, 20)
          })
        }
      } catch (e) {
        console.error('시나리오 로드 오류:', e)
      }
    } else {
      setStatusLogs(prev => {
        const time = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        return [`[${time}] ⚠️ 교재 미설정 — 수업 시작 모달에서 교재를 선택해주세요`, ...prev].slice(0, 20)
      })
    }
    setLoading(false)
  }

  // ── Realtime 구독 ─────────────────────────────────
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel(`classroom:${sessionId}`)
      // conversation_logs INSERT 감지 (학생 입장 + AI 메시지)
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
          addLog(`🟢 ${studentName} 입장 — 환영 인사 전송 중`)
          await sendCotyMessage([{ id: log.student_id, name: studentName }], undefined, log.id)
        }
        // AI 메시지 INSERT 감지
        if (log.ai_text && log.target_student_id) {
          setStudentMessages(prev => {
            const arr = prev[log.target_student_id] || []
            if (arr.find(m => m.id === log.id)) return prev
            return { ...prev, [log.target_student_id]: [...arr, { role: 'ai', text: log.ai_text, id: log.id }] }
          })
        }
      })
      // conversation_logs UPDATE 감지 (ai_text 업데이트 + 학생 답변)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversation_logs',
        filter: `session_id=eq.${sessionId}`,
      }, (payload) => {
        const log = payload.new
        // AI 메시지 업데이트
        if (log.ai_text && log.target_student_id) {
          setStudentMessages(prev => {
            const arr = prev[log.target_student_id] || []
            const exists = arr.find(m => m.id === log.id)
            if (exists) return { ...prev, [log.target_student_id]: arr.map(m => m.id === log.id ? { ...m, text: log.ai_text } : m) }
            return { ...prev, [log.target_student_id]: [...arr, { role: 'ai', text: log.ai_text, id: log.id }] }
          })
        }
        // 학생 답변 감지
        if (log.student_text && log.student_id) {
          setStudentMessages(prev => {
            const arr = prev[log.student_id] || []
            if (arr.find(m => m.id === log.id + '_s')) return prev
            return { ...prev, [log.student_id]: [...arr, { role: 'student', text: log.student_text, id: log.id + '_s' }] }
          })
          setJoinedStudents(prev => new Set(prev).add(log.student_id))
          setPendingAnswers(prev => {
            const next = new Set(prev)
            next.delete(log.student_id)
            addLog(`💬 ${students.find(s => s.id === log.student_id)?.nickname || '학생'} 답변 수신 — GPT 채점 중 (남은: ${next.size}명)`)
            return next
          })
          // GPT 채점
          if (scenario) {
            const student = students.find(s => s.id === log.student_id)
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
            }).catch(e => console.error('GPT 채점 오류:', e))
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
    if (nextStep > allSteps.length) {
      console.log('[교실] 모든 스텝 완료')
      return
    }
    const timer = setTimeout(() => setCurrentStep(nextStep), 3000)
    return () => clearTimeout(timer)
  }, [pendingAnswers, lessonStarted, scenario])

  // ── currentStep 변경 → 다음 스텝 질문 ────────────
  useEffect(() => {
    if (!lessonStarted || currentStep === 1) return
    sendStepQuestion(currentStep)
  }, [currentStep])

  // ── TTS 재생 ─────────────────────────────────────
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
        audio.onended = () => {
          setIsSpeaking(false)
          setCotyState('idle')
          URL.revokeObjectURL(url)
        }
        audio.play()
      }
    } catch { setIsSpeaking(false); setCotyState('idle') }
  }

  // ── Coty 메시지 전송 ─────────────────────────────
  const sendCotyMessage = async (
    targets: { id: string; name: string }[],
    customText?: string,
    logId?: string
  ) => {
    const currentSession = sessionRef.current
    if (!sessionId || !currentSession) return
    try {
      const firstName = targets[0]?.name || '학생'
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentText: customText || `__GREETING__:${firstName}`,
          studentId: targets[0]?.id || null,
          nickname: firstName,
          currentBook: 'Insight Builder 1',
        }),
      })
      const data = res.ok ? await res.json() : null
      const text = data?.message || data?.text || `Hi ${firstName}! Welcome to class!`
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
    } catch (e) { console.error('sendCotyMessage 오류:', e) }
  }

  // ── 스텝 질문 전송 ───────────────────────────────
  const sendStepQuestion = async (step: number) => {
    if (!sessionId || !scenario || students.length === 0) return
    const allSteps = (scenario?.phases || []).flatMap((p: any) => p.steps || [])
    const stepData = allSteps[step - 1]
    if (!stepData) return
    const aiLine = (stepData?.ai_line || `Let's try step ${step}!`).replace(/{{nickname}}/g, '여러분')
    addLog(`📢 Step ${step} 질문 전송: "${aiLine.slice(0, 40)}..."`)
    await Promise.all(students.map(student =>
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
    setPendingAnswers(new Set(students.map(s => s.id)))
  }

  // ── 학습 시작 ────────────────────────────────────
  const startLesson = async () => {
    if (!sessionId || !session || students.length === 0 || !scenario) {
      addLog(`❌ 학습 시작 실패 — sessionId:${!!sessionId} session:${!!session} students:${students.length}명 scenario:${!!scenario}`)
      return
    }
    addLog(`🚀 학습 시작 — ${scenario.title} (${students.length}명 대상)`)
    const today = new Date().toISOString().split('T')[0]
    // lesson_progress 반 단위 생성
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
    await sendStepQuestion(1)
  }

  // ── 수업 종료 ────────────────────────────────────
  const endSession = async () => {
    if (!confirm('수업을 종료하시겠어요?')) return
    await supabase.from('sessions').update({ status: 'off' }).eq('id', sessionId)
    router.push('/teacher')
  }

  // ── 로딩 ─────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400">수업 화면 로딩 중...</p>
    </div>
  )

  const joinedCount = joinedStudents.size
  const waitingCount = students.filter(s => !joinedStudents.has(s.id)).length

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* 헤더 */}
      <header className="border-b border-slate-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-xl">🏫</span>
          <div>
            <h1 className="text-sm font-bold text-white">AI Co-Teacher 수업</h1>
            <p className="text-xs text-slate-400">Step {currentStep} · {APP_VERSION}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-blue-400">🟢 접속: {joinedCount}명 / {students.length}명</span>
          <button
            onClick={startLesson}
            disabled={isSpeaking || lessonStarted || !scenario}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-700 hover:bg-emerald-600 text-white disabled:opacity-40 transition-colors"
            title={!scenario ? '시나리오 로딩 중...' : lessonStarted ? '수업 진행 중' : '학습 시작'}
          >
            {lessonStarted ? '📚 수업 중' : !scenario ? '⏳ 로딩 중' : '📚 학습 시작'}
          </button>
          <button
            onClick={endSession}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-900/60 hover:bg-red-700 text-red-300 hover:text-white transition-colors"
          >
            🔚 수업 종료
          </button>
        </div>
      </header>

      {/* 본문 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 왼쪽: Coty 아바타 */}
        <div className="w-[260px] shrink-0 border-r border-slate-800 flex flex-col items-center justify-center p-4 gap-3">
          <p className="text-xs text-pink-400 font-medium">✨ Coty 선생님</p>
          <CotyAvatar state={cotyState} />
          {scenario && (
            <div className="w-full bg-slate-800/50 rounded-xl p-3">
              <p className="text-[10px] text-slate-400 mb-1">📖 {scenario.book} Unit {scenario.unit}</p>
              <p className="text-xs text-white font-medium">{scenario.title}</p>
              <p className="text-[10px] text-emerald-400 mt-1">Step {currentStep} / {scenario.total_steps}</p>
            </div>
          )}
          {!lessonStarted && joinedCount > 0 && (
            <p className="text-xs text-amber-400 text-center">{joinedCount}명 입장 완료<br/>학습 시작 버튼을 눌러주세요</p>
          )}
          {waitingCount > 0 && lessonStarted && (
            <p className="text-xs text-slate-400 text-center">답변 대기 중: {pendingAnswers.size}명</p>
          )}
          {/* 상태 로그 */}
          {statusLogs.length > 0 && (
            <div className="w-full mt-2">
              <p className="text-[10px] text-slate-500 mb-1">📋 상태 로그</p>
              <div className="bg-slate-900 rounded-xl p-2 max-h-40 overflow-y-auto space-y-1">
                {statusLogs.map((log, i) => (
                  <p key={i} className="text-[10px] text-slate-400 leading-relaxed">{log}</p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 디버그 패널 */}
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-slate-900 border border-slate-700 rounded-2xl shadow-xl w-[620px]">
          {/* 헤더 */}
          <div
            className="flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-slate-800 rounded-t-2xl"
            onClick={() => setDebugOpen(prev => !prev)}
          >
            <p className="text-[11px] text-slate-400 font-bold">🔍 디버그 패널</p>
            <span className="text-slate-500 text-xs">{debugOpen ? '▼ 닫기' : '▲ 열기'}</span>
          </div>
          {/* 내용 */}
          {debugOpen && (
            <div className="px-4 pb-4 max-h-[420px] overflow-y-auto">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                <span className="text-slate-500 col-span-2 font-bold pt-1">── 세션 (sessions 테이블) ──</span>
                <span className="text-slate-400">sessionId</span>
                <span className="text-white font-mono truncate">{sessionId || 'null'}</span>
                <span className="text-slate-400">session.id</span>
                <span className="text-white font-mono truncate">{session?.id || 'null'}</span>
                <span className="text-slate-400">session.class_id</span>
                <span className="text-white font-mono truncate">{session?.class_id || 'null'}</span>
                <span className="text-slate-400">session.status</span>
                <span className="text-white font-mono">{session?.status || 'null'}</span>

                <span className="text-slate-500 col-span-2 font-bold pt-1">── 학생 (profiles 테이블) ──</span>
                <span className="text-slate-400">students.length</span>
                <span className="text-white font-mono">{students.length}명</span>
                <span className="text-slate-400">joinedStudents</span>
                <span className="text-white font-mono">{joinedStudents.size}명 입장</span>
                <span className="text-slate-400">pendingAnswers</span>
                <span className="text-white font-mono">{pendingAnswers.size}명 대기</span>

                <span className="text-slate-500 col-span-2 font-bold pt-1">── 시나리오 (lesson_scenarios) ──</span>
                <span className="text-slate-400">scenario</span>
                <span className={scenario ? 'text-emerald-400 font-mono' : 'text-red-400 font-mono'}>
                  {scenario ? `✅ ${scenario.title}` : '❌ null'}
                </span>
                <span className="text-slate-400">total_steps</span>
                <span className="text-white font-mono">{scenario?.total_steps ?? 'null'}</span>
                <span className="text-slate-400">scenario.id</span>
                <span className="text-white font-mono truncate">{scenario?.id ?? 'null'}</span>

                <span className="text-slate-500 col-span-2 font-bold pt-1">── 수업 진행 상태 ──</span>
                <span className="text-slate-400">currentStep</span>
                <span className="text-white font-mono">{currentStep}</span>
                <span className="text-slate-400">lessonStarted</span>
                <span className={lessonStarted ? 'text-emerald-400 font-mono' : 'text-slate-400 font-mono'}>
                  {lessonStarted ? '✅ true' : 'false'}
                </span>

                <span className="text-slate-500 col-span-2 font-bold pt-1">── 상태 로그 ──</span>
                {statusLogs.slice(0, 8).map((log, i) => (
                  <span key={i} className="text-slate-400 col-span-2 text-[10px] leading-relaxed">{log}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      {/* 오른쪽: 학생 그리드 */}
        <div className="flex-1 p-4 overflow-y-auto">
          {students.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-slate-500">이 반에 등록된 학생이 없습니다</p>
            </div>
          ) : (
            <div className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${Math.min(students.length, 4)}, 1fr)` }}
            >
              {students.map(student => {
                const isOnline = joinedStudents.has(student.id)
                const msgs = studentMessages[student.id] || []
                const hasAnswer = msgs.some(m => m.role === 'student')
                const status: 'waiting' | 'correct' | 'incorrect' = !isOnline ? 'waiting' : hasAnswer ? 'correct' : 'waiting'
                return (
                  <div key={student.id} className={cn(
                    'bg-slate-900 border-2 rounded-2xl p-3 flex flex-col gap-2 transition-all',
                    status === 'correct' ? 'border-emerald-500/60' :
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
                        {isOnline ? (hasAnswer ? '✅' : '🟢') : '⬜'}
                      </span>
                    </div>
                    {/* 대화 메시지 */}
                    {msgs.length > 0 && (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {msgs.map(msg => (
                          <div key={msg.id} className={cn(
                            'rounded-xl px-2 py-1.5 text-xs',
                            msg.role === 'ai'
                              ? 'bg-violet-900/20 border border-violet-700/30 mr-4'
                              : 'bg-emerald-900/20 border border-emerald-700/30 ml-4 text-right'
                          )}>
                            <p className={cn('text-[10px] mb-0.5', msg.role === 'ai' ? 'text-violet-400' : 'text-emerald-400')}>
                              {msg.role === 'ai' ? '💬 Coty' : '🧑 답변'}
                            </p>
                            <p className={msg.role === 'ai' ? 'text-violet-200' : 'text-emerald-200'}>
                              {msg.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                    {!isOnline && (
                      <p className="text-xs text-slate-600 text-center py-2">대기 중...</p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
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
