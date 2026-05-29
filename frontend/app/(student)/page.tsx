'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useWebSpeech } from '@/hooks/useWebSpeech'
import { useMediaRecorder } from '@/hooks/useMediaRecorder'
import { useConversation } from '@/hooks/useConversation'
import { useStudentSession } from '@/hooks/useStudentSession'
import { NavBar } from '@/components/common/NavBar'
import { useAudioStore, CONFIDENCE_THRESHOLD } from '@/store/audioStore'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'

// ── 상단 상태 인디케이터 (아바타 대체 — 공간 최소화) ──
function StatusBar({ status }: { status: string }) {
  const STATUS_LABEL: Record<string, string> = {
    idle:       'AI 선생님 대기 중',
    listening:  '듣고 있어요...',
    processing: '생각하는 중...',
    speaking:   'AI 선생님 말하는 중',
  }
  const config: Record<string, { dot: string; text: string; emoji: string }> = {
    idle:       { dot: 'bg-slate-500',               text: 'text-slate-400',   emoji: '🤖' },
    listening:  { dot: 'bg-emerald-400 animate-ping', text: 'text-emerald-400', emoji: '👂' },
    processing: { dot: 'bg-amber-400 animate-pulse',  text: 'text-amber-400',   emoji: '⚙️' },
    speaking:   { dot: 'bg-violet-400 animate-pulse', text: 'text-violet-400',  emoji: '🗣️' },
  }
  const c = config[status] ?? config.idle
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <span className="text-base">{c.emoji}</span>
      <div className="relative flex items-center justify-center w-2.5 h-2.5">
        <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75', c.dot)} />
        <span className={cn('relative inline-flex rounded-full h-2 w-2', c.dot.replace(' animate-ping','').replace(' animate-pulse',''))} />
      </div>
      <p className={cn('text-xs font-medium', c.text)}>{STATUS_LABEL[status]}</p>
    </div>
  )
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
  const { studentId, sessionId, studentNickname } = useStudentSession()
  const { sendToGPT, isSpeaking, stopSpeaking } = useConversation({ sessionId, studentId, studentNickname })

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const [internalBlobUrl, setInternalBlobUrl] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isHolding, setIsHolding] = useState(false)
  const startTimeRef = useRef<number>(0)
  const logIdRef = useRef(0)
  const sentRef = useRef(false)  // 중복 전송 방지 플래그

  // 새 메시지 or 피드백 붙을 때 자동 스크롤
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
    return () => clearTimeout(timer)
  }, [messages])

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
    // filename은 항상 undefined이므로 success만 체크
    if (success) {
      addLog('녹음 저장 성공 (재생 가능)', 'success')
    } else {
      addLog('녹음 저장 실패', 'error')
    }
  }, [addLog])

  const { startRecording, discardBlob, lastBlobUrl } = useMediaRecorder({
    onBlobReady: handleBlobReady,
    onBlobSaved: handleBlobSaved,
  })

  useEffect(() => {
    setInternalBlobUrl(lastBlobUrl)
    setIsPlaying(false)
  }, [lastBlobUrl])

  const handleInterim = useCallback((text: string) => {
    setInterimText(text)
  }, [setInterimText])

  const handleFinalResult = useCallback((text: string, confidence: number) => {
    // 중복 호출 방지
    if (sentRef.current) return
    sentRef.current = true

    const latency = Date.now() - startTimeRef.current
    setLatency(latency)
    setSpeechResult({ text, confidence, path: 'A', isFinal: true })
    discardBlob()
    addLog(`Path A: "${text}" (confidence: ${(confidence * 100).toFixed(0)}%, ${latency}ms)`, 'success')
    sendToGPT(text, { sttPath: 'A', confidence, latencyMs: latency })
  }, [discardBlob, setSpeechResult, setLatency, addLog, sendToGPT])

  const handleFallback = useCallback(async (confidence: number) => {
    addLog(`인식 불명확: confidence ${(confidence * 100).toFixed(0)}% — 재시도 요청`, 'warning')
    discardBlob()
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
        audio.onended = () => { URL.revokeObjectURL(url); setAvatarStatus('idle') }
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

  const handleMicStart = useCallback(async () => {
    if (!isSupported) { addLog('Web Speech API 미지원 브라우저', 'error'); return }
    startTimeRef.current = Date.now()
    sentRef.current = false  // 플래그 초기화
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
    <main className="h-[100dvh] bg-slate-950 text-white flex flex-col overflow-hidden">
      <NavBar />

      {/* 배경 그라디언트 */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-950 to-black pointer-events-none" />

      {/* 전체 레이아웃: NavBar 아래 꽉 채우기 */}
      <div className="relative z-10 flex flex-col flex-1 overflow-hidden max-w-lg mx-auto w-full">

        {/* ① 상태 인디케이터 (고정 높이, 작게) */}
        <div className="shrink-0 px-4 pt-1">
          <StatusBar status={avatarStatus} />
          {!isSupported && (
            <p className="text-xs text-red-400 text-center pb-1">⚠️ 이 브라우저는 음성인식을 지원하지 않습니다</p>
          )}
        </div>

        {/* ② 대화창 — 남은 세로 공간 꽉 채움 */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-0">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-slate-600 text-sm text-center">
                마이크 버튼을 누르고<br />영어로 말해보세요 👇
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={cn(
              'flex flex-col',
              msg.role === 'student' ? 'items-end' : 'items-start'
            )}>
              {/* 말풍선 */}
              <div className={cn(
                'rounded-2xl px-4 py-3 text-sm max-w-[85%]',
                msg.role === 'student'
                  ? 'bg-emerald-900/40 text-emerald-200 text-right border border-emerald-700/30'
                  : 'bg-violet-900/40 text-violet-200 border border-violet-700/30'
              )}>
                <span className="text-xs opacity-50 block mb-1">
                  {msg.role === 'student' ? '🧑 나' : '🤖 AI'}
                </span>
                {msg.content}
              </div>

              {/* 인라인 피드백 — 학생 메시지 바로 아래 */}
              {msg.role === 'student' && msg.feedback && (
                <div className="mt-1.5 max-w-[85%] w-full bg-slate-800/60 border border-slate-700/40 rounded-xl px-3 py-2 space-y-1.5">
                  {/* 점수 한 줄 요약 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>문법 <span className={cn('font-bold font-mono', msg.feedback.grammar >= 80 ? 'text-emerald-400' : msg.feedback.grammar >= 60 ? 'text-amber-400' : 'text-red-400')}>{msg.feedback.grammar}</span></span>
                      <span>유창성 <span className={cn('font-bold font-mono', msg.feedback.fluency >= 80 ? 'text-emerald-400' : msg.feedback.fluency >= 60 ? 'text-amber-400' : 'text-red-400')}>{msg.feedback.fluency}</span></span>
                      <span>어휘 <span className={cn('font-bold font-mono', msg.feedback.vocabulary >= 80 ? 'text-emerald-400' : msg.feedback.vocabulary >= 60 ? 'text-amber-400' : 'text-red-400')}>{msg.feedback.vocabulary}</span></span>
                    </div>
                    <span className={cn(
                      'text-sm font-bold font-mono',
                      msg.feedback.overall >= 80 ? 'text-emerald-400' : msg.feedback.overall >= 60 ? 'text-amber-400' : 'text-red-400'
                    )}>{msg.feedback.overall}</span>
                  </div>
                  {/* 교정 */}
                  {msg.feedback.correction && (
                    <p className="text-xs text-amber-300">
                      <span className="opacity-60">💡 </span>{msg.feedback.correction}
                    </p>
                  )}
                  {/* 팁 */}
                  <p className="text-xs text-emerald-300">
                    <span className="opacity-60">✨ </span>{msg.feedback.tip}
                  </p>
                </div>
              )}
            </div>
          ))}

          {/* 실시간 자막 — 말하는 중일 때만 표시 */}
          {(isSpeaking || interimText) && (
            <div className="bg-slate-900/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl px-4 py-3 max-w-[85%] mr-auto">
              {isSpeaking ? (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0,1,2,3].map(i => (
                      <div key={i} className="w-1 bg-violet-400 rounded-full animate-pulse"
                        style={{ height: `${10 + i * 3}px`, animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                  <p className="text-violet-300 text-xs">말하는 중...</p>
                </div>
              ) : (
                <p className="text-white text-sm leading-relaxed">
                  {interimText}
                  <span className="inline-block w-0.5 h-4 bg-emerald-400 ml-1 animate-pulse align-middle" />
                </p>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ③ 하단 컨트롤 영역 (고정) */}
        <div className="shrink-0 px-4 pb-4 pt-2 space-y-3">

          {/* 마이크 버튼 + 재생 버튼 */}
          <div className="flex items-center justify-center gap-6">
            {/* 녹음 재생 버튼 */}
            <button
              onClick={() => {
                if (!internalBlobUrl) return
                if (isPlaying && audioRef.current) {
                  audioRef.current.pause()
                  audioRef.current.currentTime = 0
                  setIsPlaying(false)
                  return
                }
                // 매번 새로 생성해서 최신 blobUrl 반영
                const audio = new Audio(internalBlobUrl)
                audioRef.current = audio
                audio.onended = () => setIsPlaying(false)
                audio.play()
                setIsPlaying(true)
              }}
              disabled={!internalBlobUrl}
              className={cn(
                'w-14 h-14 rounded-full flex items-center justify-center text-xl',
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

            {/* 메인 마이크 버튼 — 크게 */}
            <button
              onMouseDown={handleMicStart}
              onMouseUp={handleMicStop}
              onTouchStart={(e) => { e.preventDefault(); e.stopPropagation(); handleMicStart(); }}
              onTouchEnd={(e) => { e.preventDefault(); handleMicStop(); }}
              onContextMenu={(e) => e.preventDefault()}
              disabled={!isSupported}
              className={cn(
                'w-24 h-24 rounded-full flex items-center justify-center text-4xl',
                'transition-all duration-150 shadow-2xl select-none',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                isHolding
                  ? 'bg-gradient-to-br from-emerald-400 to-teal-500 scale-110 shadow-emerald-500/60 ring-4 ring-emerald-400/40'
                  : 'bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600'
              )}
            >
              {isHolding ? '🎙️' : '🎤'}
            </button>

            {/* 균형용 여백 */}
            <div className="w-14 h-14" />
          </div>

          <p className="text-xs text-slate-500 text-center">
            {isHolding ? '손을 떼면 전송됩니다' : '누르고 있는 동안 말하세요 (Push-to-Talk)'}
          </p>

          {saveMessage && (
            <div className={cn(
              'px-4 py-2 rounded-xl text-xs font-mono text-center',
              saveMessage.ok
                ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                : 'bg-red-900/60 text-red-300 border border-red-700/50'
            )}>
              {saveMessage.text}
            </div>
          )}
        </div>
      </div>

      {/* 피드백은 대화 버블 인라인으로만 표시 — 오버레이 카드 제거 */}

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
