'use client'
import { useState, useEffect, useCallback } from 'react'
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
  const supabase = createClient()

  // useWebSpeech 훅 사용 (자습화면과 동일)
  const { startListening, stopListening, isReady, isListening } = useWebSpeech({
    onFinalResult: async (text: string, confidence: number, words?: WordResult[]) => {
      if (!session || !text) return
      setSpokenText(text)
      setScreen('processing')
      await scoreStep(text, words || [])
    },
    onError: (err) => {
      console.error('STT 오류:', err)
      setScreen('ready')
    },
    onLog: (msg) => console.log('[STT]', msg),
    onSilenceCountdown: (count) => setSilenceCount(count),
    silenceThreshold: 35,
  })

  // Supabase Realtime 세션 구독
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const sessionId = params.get('session_id')
    if (!sessionId) return

    const loadSession = async () => {
      const { data: sess } = await supabase
        .from('asm_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()
      if (!sess) return

      if (sess.current_student_id && sess.current_scenario_id) {
        const [{ data: student }, { data: scenario }] = await Promise.all([
          supabase.from('profiles').select('id, name, nickname').eq('id', sess.current_student_id).single(),
          supabase.from('asm_scenarios').select('*').eq('id', sess.current_scenario_id).single(),
        ])
        if (student && scenario) {
          setSession({
            session_id: sess.id,
            scenario_id: scenario.id,
            student_id: student.id,
            student_name: student.nickname || student.name,
            steps: scenario.steps || []
          })
          setCurrentStep(sess.current_step || 1)
          setSpokenText('')
          setScreen('ready')
        }
      }
      if (sess.status === 'ended') setScreen('finished')
    }

    loadSession()

    const channel = supabase
      .channel('asm_student_' + sessionId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'asm_sessions',
        filter: 'id=eq.' + sessionId
      }, () => loadSession())
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // GPT 채점
  const scoreStep = useCallback(async (spoken: string, words: WordResult[]) => {
    if (!session) return
    const step = session.steps[currentStep - 1]
    try {
      const res = await fetch('/api/asm/results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: session.session_id,
          scenario_id: session.scenario_id,
          student_id: session.student_id,
          step: currentStep,
          target: step.expected_pattern,
          spoken,
          words,
        })
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)

      setScreen('done')
      await new Promise(r => setTimeout(r, 2000))

      const next = currentStep + 1
      if (next > session.steps.length) {
        setScreen('finished')
      } else {
        setCurrentStep(next)
        setSpokenText('')
        setScreen('ready')
      }
    } catch (e) {
      console.error('채점 오류:', e)
      setScreen('ready')
    }
  }, [session, currentStep])

  // 마이크 버튼
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
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">

      {/* 대기 화면 */}
      {screen === 'waiting' && (
        <div className="text-center space-y-6">
          <div className="text-7xl animate-pulse">⏳</div>
          <p className="text-white text-2xl font-bold">선생님을 기다리고 있어요</p>
          <p className="text-slate-400 text-sm">선생님이 시작하면 자동으로 화면이 바뀝니다</p>
        </div>
      )}

      {/* 평가 화면 */}
      {(screen === 'ready' || screen === 'recording' || screen === 'processing' || screen === 'done') && session && (
        <div className="w-full max-w-lg space-y-8">

          {/* 학생 이름 + Step */}
          <div className="text-center space-y-1">
            <p className="text-emerald-400 text-lg font-bold">👤 {session.student_name}</p>
            <p className="text-slate-400 text-sm">Step {currentStep} / {session.steps.length}</p>
          </div>

          {/* 한국어 문장 */}
          <div className="bg-slate-800 border border-slate-700 rounded-3xl p-10 text-center shadow-xl">
            <p className="text-slate-400 text-sm mb-4">🇰🇷 영어로 말해보세요</p>
            <p className="text-white text-4xl font-bold leading-relaxed">
              {currentStepData?.scene_kr}
            </p>
          </div>

          {/* 마이크 버튼 */}
          <div className="flex flex-col items-center gap-4">
            <button
              onMouseDown={handleMicDown}
              onMouseUp={handleMicUp}
              onTouchStart={handleMicDown}
              onTouchEnd={handleMicUp}
              disabled={screen === 'processing' || !isReady}
              className={`w-32 h-32 rounded-full text-5xl transition-all duration-200 shadow-xl ${
                screen === 'recording'
                  ? 'bg-red-600 hover:bg-red-500 animate-pulse scale-110 shadow-red-900'
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
                : screen === 'recording'
                ? '🔴 녹음 중... (버튼을 누르면 종료)'
                : screen === 'processing'
                ? '⚡ 채점 중...'
                : screen === 'done'
                ? '✅ 완료! 다음 문장으로 이동합니다...'
                : !isReady
                ? '🎤 마이크 준비 중...'
                : '버튼을 눌러 말하세요'}
            </p>
          </div>

          {/* 말한 텍스트 */}
          {spokenText && (
            <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-5 text-center">
              <p className="text-slate-400 text-xs mb-2">🗣️ 내가 말한 것</p>
              <p className="text-white text-2xl font-medium">{spokenText}</p>
            </div>
          )}

          {/* 진행 바 */}
          <div className="space-y-2">
            <div className="w-full bg-slate-800 rounded-full h-3">
              <div
                className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${((currentStep - 1) / session.steps.length) * 100}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 text-center">
              {currentStep - 1}/{session.steps.length} 완료
            </p>
          </div>
        </div>
      )}

      {/* 완료 화면 */}
      {screen === 'finished' && (
        <div className="text-center space-y-6">
          <div className="text-8xl">🎉</div>
          <p className="text-white text-3xl font-bold">수고했어요!</p>
          <p className="text-slate-400 text-lg">모든 Step을 완료했습니다</p>
          {session && (
            <p className="text-emerald-400 text-sm">{session.student_name} 화이팅! 💪</p>
          )}
        </div>
      )}
    </div>
  )
}
