'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'

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
  const [isReady, setIsReady] = useState(false)

  const sessionRef = useRef<SessionState | null>(null)
  const currentStepRef = useRef<number>(1)
  const scoreStepRef = useRef<(spoken: string, words: any[]) => Promise<void>>(async () => {})

  // 마이크 스트림 (화면 로드 시 열기)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const supabase = createClient()
  const sessionId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('session_id') || ''
    : ''

  // 화면 로드 시 마이크 스트림 열기
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        streamRef.current = stream
        setIsReady(true)
        console.log('✅ 마이크 스트림 열림')
      })
      .catch(e => {
        console.error('마이크 권한 오류:', e)
        setIsReady(false)
      })
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      console.log('마이크 스트림 닫힘')
    }
  }, [])

  // GPT 채점
  const scoreStep = useCallback(async (spoken: string, words: any[]) => {
    const sess = sessionRef.current
    const step = currentStepRef.current
    if (!sess) return
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
      if (data.error) throw new Error(data.error)
      console.log('채점 완료:', data.score)

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

  // 녹음 시작
  const startRecording = useCallback(() => {
    if (!streamRef.current) return
    const mr = new MediaRecorder(streamRef.current)
    mediaRecorderRef.current = mr
    chunksRef.current = []
    mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
    mr.start(100)
    console.log('🔴 녹음 시작')
  }, [])

  // 녹음 종료 + Deepgram STT
  const stopRecording = useCallback(async () => {
    return new Promise<void>((resolve) => {
      const mr = mediaRecorderRef.current
      if (!mr || mr.state === 'inactive') { resolve(); return }
      mr.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        console.log('⏹ 녹음 완료, Blob 크기:', blob.size)

        try {
          // keyword boosting - expected_pattern 단어 추출
          const sess = sessionRef.current
          const step = currentStepRef.current
          const keywords = sess?.steps[step-1]?.expected_pattern
            ?.split(' ')
            .filter((w: string) => w.length >= 2) || []

          const formData = new FormData()
          formData.append('audio', blob)
          if (keywords.length > 0) {
            formData.append('keywords', keywords.join(','))
          }

          const res = await fetch('/api/deepgram-stt', { method: 'POST', body: formData })
          const data = await res.json()
          const text = data.transcript || ''
          const words = data.words || []
          console.log('STT 결과:', text)

          if (text) {
            setSpokenText(text)
            setScreen('processing')
            await scoreStepRef.current(text, words)
          } else {
            setScreen('ready')
          }
        } catch (e) {
          console.error('STT 오류:', e)
          setScreen('ready')
        }
        resolve()
      }
      mr.stop()
    })
  }, [])

  // 세션 로드 (API 통해서 - RLS 우회)
  const loadSession = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch('/api/asm/session-state?session_id=' + sessionId)
      const data = await res.json()
      console.log('세션 상태:', data.status)

      if (data.status === 'ended') { window.location.href = '/login'; return }

      if (data.status === 'active' && data.student && data.scenario) {
        const newSession = {
          session_id: data.session_id,
          scenario_id: data.scenario.id,
          student_id: data.student.id,
          student_name: data.student.nickname || data.student.name,
          steps: data.scenario.steps || []
        }
        setSession(newSession)
        sessionRef.current = newSession
        setCurrentStep(data.current_step || 1)
        currentStepRef.current = data.current_step || 1
        setSpokenText('')
        setScreen('ready')
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

    // Realtime 구독
    const channel = supabase
      .channel('asm_student_' + sessionId)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'asm_sessions',
        filter: 'id=eq.' + sessionId
      }, (payload) => {
        console.log('asm_sessions UPDATE 감지!', payload.new)
        loadSession()
      })
      .subscribe((status) => {
        console.log('Realtime 상태:', status)
      })

    // 폴링 백업 (5초마다, waiting 상태일 때만)
    const poll = setInterval(() => {
      if (!sessionRef.current) loadSession()
    }, 5000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(poll)
    }
  }, [sessionId, loadSession])

  // Push-to-Talk
  const handleMicDown = useCallback(async () => {
    if (screen !== 'ready' || !isReady) return
    setScreen('recording')
    startRecording()
  }, [screen, isReady, startRecording])

  const handleMicUp = useCallback(async () => {
    if (screen !== 'recording') return
    await stopRecording()
  }, [screen, stopRecording])

  const currentStepData = session?.steps[currentStep - 1]

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 select-none">
      {/* 종료 버튼 */}
      <div className="fixed top-4 right-4">
        <button
          onClick={() => { if (confirm('종료하시겠습니까?')) window.location.href = '/login' }}
          className="px-4 py-2 bg-slate-800 hover:bg-red-700 text-slate-400 hover:text-white rounded-xl text-sm transition-colors"
        >✕ 종료</button>
      </div>

      {/* 대기 화면 */}
      {screen === 'waiting' && (
        <div className="text-center space-y-6">
          <div className="text-7xl animate-pulse">⏳</div>
          <p className="text-white text-2xl font-bold">선생님을 기다리고 있어요</p>
          <p className="text-slate-400 text-sm">선생님이 시작하면 자동으로 화면이 바뀝니다</p>
          <button
            onClick={() => window.location.href = '/login'}
            className="mt-4 px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-sm transition-colors"
          >✕ 종료</button>
        </div>
      )}

      {/* 평가 화면 */}
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
              onTouchStart={(e) => { e.preventDefault(); handleMicDown() }}
              onTouchEnd={(e) => { e.preventDefault(); handleMicUp() }}
              disabled={screen === 'processing' || !isReady}
              className={`w-32 h-32 rounded-full text-5xl transition-all duration-200 shadow-xl ${
                screen === 'recording'
                  ? 'bg-red-600 animate-pulse scale-110 shadow-red-900'
                  : screen === 'processing'
                  ? 'bg-slate-700 cursor-not-allowed opacity-50'
                  : screen === 'done'
                  ? 'bg-emerald-600 scale-95'
                  : !isReady
                  ? 'bg-slate-700 opacity-50'
                  : 'bg-emerald-600 hover:bg-emerald-500 hover:scale-105 active:scale-95'
              }`}
            >
              {screen === 'recording' ? '⏹' :
               screen === 'processing' ? '⚙️' :
               screen === 'done' ? '✅' :
               !isReady ? '...' : '🎤'}
            </button>

            <p className="text-slate-400 text-sm h-6">
              {screen === 'recording' ? '🔴 누르고 있는 동안 녹음됩니다'
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

      {/* 완료 화면 */}
      {screen === 'finished' && (
        <div className="text-center space-y-6">
          <div className="text-8xl">🎉</div>
          <p className="text-white text-3xl font-bold">수고했어요!</p>
          <p className="text-slate-400 text-lg">모든 Step을 완료했습니다</p>
          {session && <p className="text-emerald-400 text-sm">{session.student_name} 화이팅! 💪</p>}
        </div>
      )}
      {/* 디버그 패널 */}
      <div className="fixed top-0 left-0 bottom-0 w-64 bg-black/90 text-green-400 text-xs p-3 font-mono space-y-1 overflow-y-auto z-50">
        <p className="text-yellow-400 font-bold">🔧 DEBUG</p>
        <p>sessionId: <span className="text-white text-[10px]">{sessionId.slice(0,16)}...</span></p>
        <p>session: <span className="text-white">{session ? session.student_name : 'null'}</span></p>
        <p>screen: <span className="text-yellow-400">{screen}</span></p>
        <p>step: <span className="text-yellow-400">{currentStep}</span>/{session?.steps.length || 0}</p>
        <p>isReady: <span className={isReady ? 'text-emerald-400' : 'text-red-400'}>{isReady ? 'true' : 'false'}</span></p>
        <p>spoken: <span className="text-white">{spokenText || '없음'}</span></p>
        <p className="text-slate-500 mt-2">--- steps ---</p>
        {(session?.steps || []).map((s, i) => (
          <p key={i} className={i === currentStep - 1 ? 'text-yellow-400' : 'text-slate-600'}>
            {i+1}. {s?.scene_kr || ''}
          </p>
        ))}
      </div>

      {/* 디버그 패널 */}
      <div className="fixed top-0 left-0 bottom-0 w-64 bg-black/90 text-green-400 text-xs p-3 font-mono space-y-1 overflow-y-auto z-50">
        <p className="text-yellow-400 font-bold">🔧 DEBUG</p>
        <p>sessionId: <span className="text-white text-[10px]">{sessionId.slice(0,16)}...</span></p>
        <p>session: <span className="text-white">{session ? session.student_name : 'null'}</span></p>
        <p>screen: <span className="text-yellow-400">{screen}</span></p>
        <p>step: <span className="text-yellow-400">{currentStep}</span>/{session?.steps.length || 0}</p>
        <p>isReady: <span className={isReady ? 'text-emerald-400' : 'text-red-400'}>{isReady ? 'true' : 'false'}</span></p>
        <p>spoken: <span className="text-white">{spokenText || '없음'}</span></p>
        <p className="text-slate-500 mt-2">--- steps ---</p>
        {(session?.steps || []).map((s, i) => (
          <p key={i} className={i === currentStep - 1 ? 'text-yellow-400' : 'text-slate-600'}>
            {i+1}. {s?.scene_kr || ''}
          </p>
        ))}
      </div>
    </div>
  )
}
