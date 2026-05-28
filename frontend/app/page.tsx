'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useWebSpeech } from '@/hooks/useWebSpeech'
import { useMediaRecorder } from '@/hooks/useMediaRecorder'
import { useConversation } from '@/hooks/useConversation'
import { useStudentSession } from '@/hooks/useStudentSession'
import { FeedbackCard } from '@/components/student/FeedbackCard'
import { useAudioStore, CONFIDENCE_THRESHOLD } from '@/store/audioStore'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'

// ── 아바타 상태 오브 ──────────────────────────────────
function AvatarOrb({ status }: { status: string }) {
  return (
    <div className="relative flex items-center justify-center">
      <div className={cn(
        'absolute rounded-full transition-all duration-700',
        status === 'listening' && 'animate-ping bg-emerald-500/20 w-40 h-40',
        status === 'speaking'  && 'animate-pulse bg-violet-500/20 w-44 h-44',
        status === 'processing'&& 'animate-spin bg-amber-500/10 w-36 h-36',
        status === 'idle'      && 'bg-slate-700/30 w-32 h-32'
      )} />
      <div className={cn(
        'absolute rounded-full transition-all duration-500',
        status === 'listening' && 'bg-emerald-500/30 w-32 h-32',
        status === 'speaking'  && 'bg-violet-500/30 w-36 h-36',
        status === 'processing'&& 'bg-amber-500/20 w-28 h-28',
        status === 'idle'      && 'bg-slate-700/20 w-24 h-24'
      )} />
      <div className={cn(
        'relative z-10 w-24 h-24 rounded-full flex items-center justify-center text-4xl shadow-2xl transition-all duration-300',
        status === 'listening' && 'bg-gradient-to-br from-emerald-400 to-teal-600 scale-110',
        status === 'speaking'  && 'bg-gradient-to-br from-violet-400 to-purple-600 scale-110',
        status === 'processing'&& 'bg-gradient-to-br from-amber-400 to-orange-500',
        status === 'idle'      && 'bg-gradient-to-br from-slate-600 to-slate-800'
      )}>
        {status === 'idle'       && '🤖'}
        {status === 'listening'  && '👂'}
        {status === 'processing' && '⚙️'}
        {status === 'speaking'   && '🗣️'}
      </div>
    </div>
  )
}

const STATUS_LABEL: Record<string, string> = {
  idle:       'AI 선생님 대기 중',
  listening:  '듣고 있어요...',
  processing: '생각하는 중...',
  speaking:   'AI 선생님 말하는 중',
}
const STATUS_COLOR: Record<string, string> = {
  idle:       'text-slate-400',
  listening:  'text-emerald-400',
  processing: 'text-amber-400',
  speaking:   'text-violet-400',
}

interface LogEntry {
  id: number
  time: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

// ── 메인 페이지 ───────────────────────────────────────
export default function StudentPage() {
  const {
    avatarStatus, interimText,
    setAvatarStatus, setInterimText, setSpeechResult, setLatency,
  } = useAudioStore()
  const { isLogDrawerOpen, setLogDrawerOpen, messages } = useUIStore()
  const { studentId, sessionId } = useStudentSession()
  const { sendToGPT, isSpeaking, stopSpeaking, feedback, clearFeedback } = useConversation({ sessionId, studentId })

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [internalBlobUrl, setInternalBlobUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isHolding, setIsHolding] = useState(false)
  const startTimeRef = useRef<number>(0)
  const logIdRef = useRef(0)

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
    setLogs((prev) => [{ id: logIdRef.current++, time, message, type }, ...prev].slice(0, 50))
  }, [])

  // Path B: Blob → Whisper 서버
  const handleBlobReady = useCallback(async (blob: Blob) => {
    addLog(`Path B: Whisper 전송 중... (${(blob.size / 1024).toFixed(1)}KB)`, 'warning')
    setAvatarStatus('processing')
    const whisperUrl = process.env.NEXT_PUBLIC_WHISPER_SERVER_URL || 'http://localhost:8000'
    const formData = new FormData()
    formData.append('audio_blob', blob, 'audio.webm')
    formData.append('language', 'en')
    try {
      const start = Date.now()
      const res = await fetch(`${whisperUrl}/api/v1/stt`, { method: 'POST', body: formData })
      const data = await res.json()
      const latency = Date.now() - start
      setLatency(latency)
      setSpeechResult({ text: data.text, confidence: data.confidence, path: 'B', isFinal: true })
      addLog(`Path B 완료: "${data.text}" (${latency}ms)`, 'success')
    } catch {
      addLog('Path B 실패: Whisper 서버 연결 불가', 'error')
      setAvatarStatus('idle')
    }
  }, [addLog, setAvatarStatus, setSpeechResult, setLatency])

  const handleBlobSaved = useCallback((success: boolean, filename?: string) => {
    if (success && filename) {
      setSaveMessage({ text: `✅ 저장됨: 다운로드/${filename}`, ok: true })
      addLog(`녹음 저장 성공: ${filename}`, 'success')
    } else {
      setSaveMessage({ text: '❌ 저장 실패', ok: false })
      addLog('녹음 저장 실패', 'error')
    }
    setTimeout(() => setSaveMessage(null), 4000)
  }, [addLog])

  const { startRecording, discardBlob, lastBlobUrl } = useMediaRecorder({
    onBlobReady: handleBlobReady,
    onBlobSaved: handleBlobSaved,
  })

  // lastBlobUrl이 바뀌면 오디오 소스 업데이트
  useEffect(() => {
    setInternalBlobUrl(lastBlobUrl)
    setIsPlaying(false)
  }, [lastBlobUrl])

  // Web Speech API 콜백
  const handleInterim = useCallback((text: string) => {
    setInterimText(text)
  }, [setInterimText])

  const handleFinalResult = useCallback((text: string, confidence: number) => {
    const latency = Date.now() - startTimeRef.current
    setLatency(latency)
    setSpeechResult({ text, confidence, path: 'A', isFinal: true })
    discardBlob()
    setInterimText('')
    addLog(`Path A: "${text}" (confidence: ${(confidence * 100).toFixed(0)}%, ${latency}ms)`, 'success')
    sendToGPT(text, { sttPath: 'A', confidence, latencyMs: latency })
  }, [discardBlob, setSpeechResult, setLatency, addLog, sendToGPT])

  const handleFallback = useCallback(async (confidence: number) => {
    addLog(`인식 불명확: confidence ${(confidence * 100).toFixed(0)}% — 재시도 요청`, 'warning')
    discardBlob() // Blob 즉시 파기
    setInterimText('')  

    // AI가 음성으로 다시 말해달라고 요청
    setAvatarStatus('speaking')
    const retryMessages = [
      "Sorry, I couldn't quite hear you. Could you say that again?",
      "I didn't catch that clearly. Could you repeat that, please?",
      "Pardon? Could you say that once more?",
    ]
    const msg = retryMessages[Math.floor(Math.random() * retryMessages.length)]

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msg, voice: 'nova' }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audio.onended = () => {
          URL.revokeObjectURL(url)
          setAvatarStatus('idle')
        }
        await audio.play()
      }
    } catch {
      setAvatarStatus('idle')
    }
  }, [discardBlob, addLog, setAvatarStatus])

  const handleError = useCallback((error: string) => {
    addLog(`STT 오류: ${error}`, 'error')
    setAvatarStatus('idle')
    discardBlob()
  }, [addLog, setAvatarStatus, discardBlob])

  const { isSupported, isListening, startListening, stopListening } = useWebSpeech({
    onInterimResult: handleInterim,
    onFinalResult: handleFinalResult,
    onFallback: handleFallback,
    onError: handleError,
    onLog: (msg) => addLog(msg, 'info'),
  })

  // 마이크 버튼 핸들러
  const handleMicStart = useCallback(async () => {
    if (!isSupported) { addLog('Web Speech API 미지원 브라우저', 'error'); return }
    startTimeRef.current = Date.now()
    setIsHolding(true)
    setAvatarStatus('listening')
    setInterimText('')
    addLog('마이크 시작 — Web Speech + MediaRecorder 병렬 실행', 'info')
    await startRecording()
    startListening()
  }, [isSupported, startRecording, startListening, setAvatarStatus, setInterimText, addLog])

  const handleMicStop = useCallback(() => {
    setIsHolding(false)
    setAvatarStatus('idle')
    stopListening()
  }, [stopListening, setAvatarStatus])

  return (
    <main className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* 배경 */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-950 to-black pointer-events-none" />

      <div className="relative z-10 flex flex-col items-center justify-between min-h-screen p-6 max-w-lg mx-auto w-full">

        {/* 상단 헤더 */}
        <div className="w-full flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <div className={cn('w-2 h-2 rounded-full',
              avatarStatus === 'idle' ? 'bg-slate-500' : 'bg-emerald-400 animate-pulse'
            )} />
            <span className="text-xs text-slate-400 font-mono">AI Co-Teacher</span>
          </div>
          <button
            onClick={() => setLogDrawerOpen(!isLogDrawerOpen)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-mono"
          >
            [{logs.length} logs]
          </button>
        </div>

        {/* 중앙 아바타 */}
        <div className="flex flex-col items-center gap-6 flex-1 justify-center">
          <AvatarOrb status={avatarStatus} />
          <div className="text-center space-y-1">
            <p className={cn('text-sm font-medium transition-colors', STATUS_COLOR[avatarStatus])}>
              {STATUS_LABEL[avatarStatus]}
            </p>
            {!isSupported && (
              <p className="text-xs text-red-400">⚠️ 이 브라우저는 음성인식을 지원하지 않습니다</p>
            )}
          </div>

          {/* 대화 로그 (최근 4개) */}
          {messages.length > 0 && (
            <div className="w-full space-y-2 max-h-48 overflow-y-auto">
              {messages.slice(-4).map((msg) => (
                <div key={msg.id} className={cn(
                  'rounded-xl px-4 py-2 text-sm max-w-[85%]',
                  msg.role === 'student'
                    ? 'bg-emerald-900/40 text-emerald-200 ml-auto text-right border border-emerald-700/30'
                    : 'bg-violet-900/40 text-violet-200 mr-auto border border-violet-700/30'
                )}>
                  <span className="text-xs opacity-50 block mb-1">
                    {msg.role === 'student' ? '🧑 나' : '🤖 AI'}
                  </span>
                  {msg.content}
                </div>
              ))}
            </div>
          )}

          {/* 실시간 자막 영역 */}
          <div className="w-full min-h-[80px] bg-slate-900/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-4 flex items-center justify-center">
            {isSpeaking ? (
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {[0,1,2,3].map(i => (
                    <div key={i} className="w-1 bg-violet-400 rounded-full animate-pulse"
                      style={{ height: `${12 + i * 4}px`, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
                <p className="text-violet-300 text-sm">AI 선생님 말하는 중...</p>
              </div>
            ) : interimText ? (
              <p className="text-white text-center leading-relaxed">
                {interimText}
                <span className="inline-block w-0.5 h-5 bg-emerald-400 ml-1 animate-pulse align-middle" />
              </p>
            ) : (
              <p className="text-slate-600 text-sm text-center">
                마이크 버튼을 누르고 영어로 말해보세요
              </p>
            )}
          </div>
          {/* 피드백 카드 */}
          {feedback && (
            <FeedbackCard feedback={feedback} onClose={clearFeedback} />
          )}
        </div>

        {/* 하단 마이크 버튼 */}
        <div className="w-full flex flex-col items-center gap-4 pb-4">
          <div className="flex items-center gap-6">
            {/* 녹음 재생 버튼 */}
            <button
              onClick={() => {
                if (!internalBlobUrl) return
                if (!audioRef.current) {
                  audioRef.current = new Audio(internalBlobUrl)
                  audioRef.current.onended = () => setIsPlaying(false)
                } else {
                  audioRef.current.src = internalBlobUrl
                }
                if (isPlaying) {
                  audioRef.current.pause()
                  audioRef.current.currentTime = 0
                  setIsPlaying(false)
                } else {
                  audioRef.current.play()
                  setIsPlaying(true)
                }
              }}
              disabled={!internalBlobUrl}
              className={cn(
                'w-12 h-12 rounded-full flex items-center justify-center text-xl',
                'transition-all duration-200 shadow-lg select-none',
                internalBlobUrl
                  ? isPlaying
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    : 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              )}
              title="마지막 녹음 재생"
            >
              {isPlaying ? '⏹️' : '▶️'}
            </button>

            {/* 메인 마이크 버튼 */}
            <button
              onMouseDown={handleMicStart}
              onMouseUp={handleMicStop}
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); handleMicStart(); }}
              onTouchEnd={(e) => { e.preventDefault(); handleMicStop(); }}
              onContextMenu={(e) => e.preventDefault()}
              disabled={!isSupported}
              className={cn(
                'w-20 h-20 rounded-full flex items-center justify-center text-3xl',
                'transition-all duration-200 shadow-2xl select-none',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                isHolding
                  ? 'bg-gradient-to-br from-emerald-400 to-teal-500 scale-110 shadow-emerald-500/50'
                  : 'bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600 scale-100'
              )}
            >
              {isHolding ? '🎙️' : '🎤'}
            </button>

            {/* 여백 맞추기용 */}
            <div className="w-12 h-12" />
          </div>

          <p className="text-xs text-slate-500">
            {isHolding ? '손을 떼면 전송됩니다' : '누르고 있는 동안 말하세요 (Push-to-Talk)'}
          </p>

          {/* 저장 메시지 */}
          {saveMessage && (
            <div className={cn(
              'px-4 py-2 rounded-xl text-xs font-mono transition-all',
              saveMessage.ok
                ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                : 'bg-red-900/60 text-red-300 border border-red-700/50'
            )}>
              {saveMessage.text}
            </div>
          )}
        </div>
      </div>

      {/* 시스템 로그 Drawer */}
      <div className={cn(
        'fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-700/50',
        'transition-transform duration-300 z-50 max-h-72 overflow-y-auto',
        isLogDrawerOpen ? 'translate-y-0' : 'translate-y-full'
      )}>
        <div className="p-4 space-y-1 font-mono text-xs">
          <div className="flex items-center justify-between mb-3 sticky top-0 bg-slate-900/95 py-1">
            <span className="text-slate-400">System Log</span>
            <button onClick={() => setLogDrawerOpen(false)} className="text-slate-500 hover:text-white">✕</button>
          </div>
          {logs.length === 0 && <p className="text-slate-600">아직 로그가 없습니다.</p>}
          {logs.map((log) => (
            <div key={log.id} className="flex gap-2">
              <span className="text-slate-600 shrink-0">{log.time}</span>
              <span className={cn(
                log.type === 'success' && 'text-emerald-400',
                log.type === 'warning' && 'text-amber-400',
                log.type === 'error'   && 'text-red-400',
                log.type === 'info'    && 'text-slate-300',
              )}>
                {log.message}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
