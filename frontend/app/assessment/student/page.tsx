'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useWebSpeech } from '@/hooks/useWebSpeech'
import type { WordResult } from '@/types'

interface Step {
  step: number
  scene_kr: string
  expected_pattern: string
}

interface SessionState {
  session_id: string
  scenario_id: string
  student_id: string
  student_name: string
  steps: Step[]
}

type ScreenState = 'waiting' | 'ready' | 'recording' | 'processing' | 'done' | 'finished'

export default function AssessmentStudentPage() {
  const [session, setSession] = useState<SessionState | null>(null)
  const [screen, setScreen] = useState<ScreenState>('waiting')
  const [currentStep, setCurrentStep] = useState(1)
  const [spokenText, setSpokenText] = useState('')
  const [silenceCount, setSilenceCount] = useState<number | null>(null)

  const sessionRef = useRef<SessionState | null>(null)
  const currentStepRef = useRef<number>(1)
  const scoreStepRef = useRef<(spoken: string, words: WordResult[]) => Promise<void>>(async () => {})
  const supabase = createClient()

  const sessionId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('session_id') || ''
    : ''

  // GPT 채점
  const scoreStep = useCallback(async (spoken: string, words: WordResult[]) => {
    const sess = sessionRef.current
    const step = currentStepRef.current
    if (!sess) { console.log('scoreStep: session null'); return }

    const stepData = sess.steps[step - 1]
    console.log('채점 시작:', { spoken, step, target: stepData?.expected_pattern })

    try {
      const res = await fetch('/api/asm/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sess.session_id,
          scenario_id: sess.scenario_id,
          student_id: sess.student_id,
          step,
          target: stepData?.expected_pattern || '',
          spoken,
          words,
        })
      })
      const data = await res.json()
      console.log('채점 결과:', data)
      if (data.error) throw new Error(data.error)

      setScreen('done')
      await new Promise(r => setTimeout(r, 2000))

      const next = step + 1
      if (next > sess.steps.length) {
        setScreen('finished')
      } else {
        setCurrentStep(next)
        currentStepRef.current = next
        setSpokenText('')
        setScreen('ready')
      }
    } catch (e) {
      console.error('채점 오류:', e)
      setScreen('ready')
    }
  }, [])

  useEffect(() => { scoreStepRef.current = scoreStep }, [scoreStep])

  // useWebSpeech
  const { startListening, stopListening, isReady } = useWebSpeech({
    onFinalResult: async (text: string, confidence: number, words?: WordResult[]) => {
      console.log('onFinalResult:', text, 'session:', !!sessionRef.current)
      if (!sessionRef.current || !text) return
      setSpokenText(text)
      setScreen('processing')
      await scoreStepRef.current(text, words || [])
    },
    onError: (err) => { console.error('STT 오류:', err); setScreen('ready') },
    onLog: (msg) => console.log('[STT]', msg),
    onSilenceCountdown: (count) => setSilenceCount(count),
    silenceThreshold: 35,
  })

  // 세션 로드 함수
  const loadSession = useCallback(async () => {
    if (!sessionId) return
    console.log('loadSession 호출')
    try {
      const { data: sess } = await supabase
        .from('asm_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()
      if (!sess) return
      console.log('세션 상태:', sess.status, 'current_student_id:', sess.current_student_id)

      if (sess.status === 'ended') { setScreen('finished'); return }

      if (sess.current_student_id && sess.current_scenario_id) {
        const [{ data: student }, { data: scenario }] = await Promise.all([
          supabase.from('profiles').select('id, name, nickname').eq('id', sess.current_student_id).single(),
          supabase.from('asm_scenarios').select('*').eq('id', sess.current_scenario_id).single(),
        ])
        if (student && scenario) {
          const newSession = {
            session_id: sess.id,
            scenario_id: scenario.id,
            student_id: student.id,
            student_name: student.nickname || student.name,
            steps: scenario.steps || []
          }
          console.log('세션 로드 완료:', newSession.student_name, '스텝수:', newSession.steps.length)
          setSession(newSession)
          sessionRef.current = newSession
          setCurrentStep(sess.current_step || 1)
          currentStepRef.current = sess.current_step || 1
          setSpokenText('')
          setScreen('ready')
        }
      } else {
        setScreen('waiting')
      }
    } catch (e) {
      console.error('loadSession 오류:', e)
    }
  }, [sessionId])

  // 초기 로드 + Realtime 구독
  useEffect(() => {
    if (!sessionId) return
    loadSession()

    const channel = supabase
      .channel('asm_student_' + sessionId + '_' + Date.now())
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'asm_sessions',
        filter: 'id=eq.' + sessionId
      }, (payload) => {
        console.log('asm_sessions UPDATE 감지:', payload.new)
        loadSession()
      })
      .subscribe((status) => {
        console.log('Realtime 구독 상태:', status)
      })

    return () => { supabase.removeChannel(channel) }
  }, [sessionId, loadSession])

  // Push-to-Talk
  const handleMicDown = useCallback(async () => {
    if (screen !== 'ready') return
    setScreen('recording')
    await startListening()
  }, [screen, startListening])

  const handleMicUp = useCallback(async () => {
    if (screen !== 'recording') return
    await stopListening()
  }, [screen, stopListening])

  const currentStepData = session?.steps[currentStep - 1]

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 select-none">

      {screen === 'waiting' && (
        <div className="text-center space-y-6">
          <div className="text-7xl animate-pulse">⏳</div>
          <p className="text-white text-2xl font-bold">선생님을 기다리고 있어요</p>
          <p className="text-slate-400 text-sm">선생님이 시작하면 자동으로 화면이 바뀝니다</p>
        </div>
      )}

      {(screen === 'ready' || screen === 'recording' || screen === 'processing' || screen === 'done') && session && (
        <div className="w-full max-w-lg space-y-8">
          <div className="text-center space-y-1">
            <p className="text-emerald-400 text-lg font-bold">👤 {session.student_name}</p>
            <p className="text-slate-400 text-sm">Step {currentStep} / {session.steps.length}</p>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-10 text-center shadow-xl">
            <p className="text-slate-400 text-sm mb-4">🇰🇷 영어로 말해보세요</p>
            <p className="text-white text-4xl font-bold leading-relaxed">
              {currentStepData?.scene_kr}
            </p>
          </div>

          <div className="flex flex-col items-center gap-4">
            <button
              onMouseDown={handleMicDown}
              onMouseUp={handleMicUp}
              onTouchStart={handleMicDown}
              onTouchEnd={handleMicUp}
              disabled={screen === 'processing' || !isReady}
              className={`w-32 h-32 rounded-full text-5xl transition-all duration-200 shadow-xl ${
                screen === 'recording'
                  ? 'bg-red-600 animate-pulse scale-110 shadow-red-900'
                  : screen === 'processing'
                  ? 'bg-slate-700 cursor-not-allowed opacity-50'
                  : screen === 'done'
                  ? 'bg-emerald-600 scale-95'
                  : 'bg-emerald-600 hover:bg-emerald-500 hover:scale-105 active:scale-95'
              }`}
            >
              {screen === 'recording' ? '⏹' :
               screen === 'processing' ? '⚙️' :
               screen === 'done' ? '✅' : '🎤'}
            </button>

            <p className="text-slate-400 text-sm h-6">
              {screen === 'recording' && silenceCount !== null
                ? `🔴 녹음 중... ${silenceCount}초 후 자동 종료`
                : screen === 'recording' ? '🔴 누르고 있는 동안 녹음됩니다'
                : screen === 'processing' ? '⚡ 채점 중...'
                : screen === 'done' ? '✅ 완료! 다음 문장으로...'
                : !isReady ? '🎤 마이크 준비 중...'
                : '버튼을 누르고 말하세요'}
            </p>
          </div>

          {spokenText && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5 text-center">
              <p className="text-slate-400 text-xs mb-2">🗣️ 내가 말한 것</p>
              <p className="text-white text-2xl font-medium">{spokenText}</p>
            </div>
          )}

          <div className="space-y-2">
            <div className="w-full bg-slate-800 rounded-full h-3">
              <div
                className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${((currentStep - 1) / session.steps.length) * 100}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 text-center">{currentStep - 1}/{session.steps.length} 완료</p>
          </div>
        </div>
      )}

      {screen === 'finished' && (
        <div className="text-center space-y-6">
          <div className="text-8xl">🎉</div>
          <p className="text-white text-3xl font-bold">수고했어요!</p>
          <p className="text-slate-400 text-lg">모든 Step을 완료했습니다</p>
          {session && <p className="text-emerald-400 text-sm">{session.student_name} 화이팅! 💪</p>}
        </div>
      )}
    {/* 디버그 패널 */}
      <div className="fixed bottom-0 left-0 right-0 bg-black/80 text-green-400 text-xs p-3 font-mono space-y-1 max-h-40 overflow-y-auto">
        <p>🔧 DEBUG</p>
        <p>sessionId: {sessionId || 'none'}</p>
        <p>session: {session ? session.student_name + ' / ' + session.session_id.slice(0,8) : 'null'}</p>
        <p>sessionRef: {sessionRef.current ? sessionRef.current.student_name : 'null'}</p>
        <p>screen: {screen}</p>
        <p>currentStep: {currentStep} (ref: {currentStepRef.current})</p>
        <p>steps: {session?.steps.length || 0}개</p>
        <p>isReady: {isReady ? 'true' : 'false'}</p>
        <p>spokenText: {spokenText || '없음'}</p>
      </div>
    </div>
  )
}
