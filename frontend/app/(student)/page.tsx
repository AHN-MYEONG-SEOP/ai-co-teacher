'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useWebSpeech } from '@/hooks/useWebSpeech'
import { useMediaRecorder } from '@/hooks/useMediaRecorder'
import { useConversation } from '@/hooks/useConversation'
import { useStudentSession, type StudentSettings } from '@/hooks/useStudentSession'
import { useCurriculum } from '@/hooks/useCurriculum'
import { NavBar } from '@/components/common/NavBar'
import { useAudioStore } from '@/store/audioStore'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/lib/utils'
import type { WordResult } from '@/types'

// ── 설정 모달 ──────────────────────────────────────────
function SettingsModal({
  settings,
  onUpdate,
  onClose,
}: {
  settings: StudentSettings
  onUpdate: (s: Partial<StudentSettings>) => Promise<void>
  onClose: () => void
}) {
  const [local, setLocal] = useState(settings)
  const [saving, setSaving] = useState(false)
  const { booksByLevel, level_order, getUnits } = useCurriculum()

  const handleSave = async () => {
    setSaving(true)
    await onUpdate(local)
    setSaving(false)
    onClose()
  }

  const units = getUnits(local.current_book)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-t-3xl p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-300 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">⚙️ 설정</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-sm">✕</button>
        </div>

        {/* 📚 학습 교재 선택 */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-300">📚 학습 교재</p>

          {/* Book 선택 */}
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Book</p>
            <select
              value={local.current_book}
              onChange={(e) => setLocal(p => ({
                ...p,
                current_book: e.target.value,
                current_unit: 1,  // book 바뀌면 unit 1로 초기화
              }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
            >
              {level_order.map(level => (
                booksByLevel[level] && (
                  <optgroup key={level} label={`── ${level} ──`}>
                    {booksByLevel[level].map(book => (
                      <option key={book} value={book}>{book}</option>
                    ))}
                  </optgroup>
                )
              ))}
            </select>
          </div>

          {/* Unit 선택 */}
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Unit</p>
            <select
              value={local.current_unit}
              onChange={(e) => setLocal(p => ({ ...p, current_unit: Number(e.target.value) }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
            >
              {units.map(u => (
                <option key={u.unit} value={u.unit}>
                  Unit {u.unit}{u.title ? ` — ${u.title}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 선택된 Unit 미리보기 */}
          {units.find(u => u.unit === local.current_unit) && (
            <div className="bg-slate-800/60 rounded-xl px-3 py-2 space-y-1">
              <p className="text-xs text-emerald-400">학습 단어</p>
              <p className="text-xs text-slate-300 leading-relaxed">
                {units.find(u => u.unit === local.current_unit)?.words.split(',').slice(0, 8).join(', ')}...
              </p>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-300">🔊 AI 말하기 속도</p>
          <div className="space-y-2">
            {([
              { value: 'slow',   label: '느림',  desc: '천천히 또렷하게' },
              { value: 'normal', label: '보통',  desc: '일반적인 속도' },
              { value: 'fast',   label: '빠름',  desc: '원어민 속도에 가깝게' },
            ] as const).map((opt) => (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                <div className={cn(
                  'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                  local.tts_speed === opt.value
                    ? 'border-emerald-400 bg-emerald-400'
                    : 'border-slate-600 group-hover:border-slate-400'
                )}>
                  {local.tts_speed === opt.value && (
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                  )}
                </div>
                <input
                  type="radio"
                  className="sr-only"
                  checked={local.tts_speed === opt.value}
                  onChange={() => setLocal(p => ({ ...p, tts_speed: opt.value }))}
                />
                <div>
                  <span className="text-sm text-white">{opt.label}</span>
                  <span className="text-xs text-slate-500 ml-2">{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* AI 한국어 번역 표시 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-300">🇰🇷 AI 한국어 번역 표시</p>
            <p className="text-xs text-slate-500 mt-0.5">AI가 한 말을 한국어로 번역해서 보여줌</p>
          </div>
          <button
            onClick={() => setLocal(p => ({ ...p, show_translation: !p.show_translation }))}
            className={cn(
              'w-12 h-6 rounded-full transition-colors relative',
              local.show_translation ? 'bg-emerald-500' : 'bg-slate-600'
            )}
          >
            <div className={cn(
              'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
              local.show_translation ? 'translate-x-6' : 'translate-x-0.5'
            )} />
          </button>
        </div>

        {/* 발화 피드백 표시 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-300">📝 발화 피드백 표시</p>
            <p className="text-xs text-slate-500 mt-0.5">말한 후 문법/유창성 점수 표시</p>
          </div>
          <button
            onClick={() => setLocal(p => ({ ...p, show_feedback: !p.show_feedback }))}
            className={cn(
              'w-12 h-6 rounded-full transition-colors relative',
              local.show_feedback ? 'bg-emerald-500' : 'bg-slate-600'
            )}
          >
            <div className={cn(
              'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
              local.show_feedback ? 'translate-x-6' : 'translate-x-0.5'
            )} />
          </button>
        </div>

        {/* 저장 버튼 */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-2xl py-3 text-sm font-medium transition-colors"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}

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

// 단어 confidence → 색상 표시
function WordConfidenceDisplay({ words }: { words: WordResult[] }) {
  if (!words.length) return null
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1">
      {words.map((w, i) => {
        const color = w.confidence >= 0.9
          ? 'text-emerald-400'
          : w.confidence >= 0.7
          ? 'text-amber-400'
          : 'text-red-400'
        return (
          <span key={i} className={cn('text-sm font-medium', color)}>
            {w.word}
          </span>
        )
      })}
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
    avatarStatus, interimText, interimWords,
    setAvatarStatus, setInterimText, setSpeechResult, setLatency,
    setInterimWords, setFinalWords,
  } = useAudioStore()
  const { isLogDrawerOpen, setLogDrawerOpen, messages, addMessage } = useUIStore()
  const { studentId, sessionId, studentNickname, settings, updateSettings } = useStudentSession()
  const { sendToGPT, isSpeaking, stopSpeaking } = useConversation({
    sessionId, studentId, studentNickname,
    ttsSpeed: settings.tts_speed,
    showTranslation: settings.show_translation,
    currentBook: settings.current_book,
    currentUnit: settings.current_unit,
  })
  const [showSettings, setShowSettings] = useState(false)

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

  // 새 메시지 or 상태 변화 시 자동 스크롤
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
    return () => clearTimeout(timer)
  }, [messages, isHolding, interimText, isSpeaking])

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

  const handleInterim = useCallback((text: string, words?: WordResult[]) => {
    setInterimText(text)
    if (words) setInterimWords(words)
  }, [setInterimText, setInterimWords])

  const handleFinalResult = useCallback((text: string, confidence: number, words?: WordResult[]) => {
    if (sentRef.current) return
    sentRef.current = true

    // 텍스트 정제 — 첫 글자 대문자, 마지막 문장부호 추가
    const normalized = text.trim()
    const capitalized = normalized.charAt(0).toUpperCase() + normalized.slice(1)
    const punctuated = /[.?!]$/.test(capitalized) ? capitalized : capitalized + '.'

    const latency = Date.now() - startTimeRef.current
    setLatency(latency)
    setSpeechResult({ text: punctuated, confidence, path: 'A', isFinal: true })
    setInterimText('')
    setInterimWords([])
    if (words) setFinalWords(words)
    discardBlob()
    addLog(`Path A: "${punctuated}" (confidence: ${(confidence * 100).toFixed(0)}%, ${latency}ms)`, 'success')
    sendToGPT(punctuated, { sttPath: 'A', confidence, latencyMs: latency }, words)
  }, [discardBlob, setSpeechResult, setLatency, setInterimText, setInterimWords, setFinalWords, addLog, sendToGPT])

  const handleFallback = useCallback(async (confidence: number, partialText?: string) => {
    if (sentRef.current) return
    sentRef.current = true

    addLog(`인식 불명확: confidence ${(confidence * 100).toFixed(0)}% — 재시도 요청`, 'warning')
    discardBlob()
    setInterimText('')
    setInterimWords([])
    setAvatarStatus('speaking')

    let msgEn = ''
    let msgKo = ''

    if (partialText && partialText.trim() && confidence > 0) {
      // 부분 인식된 텍스트가 있으면 GPT로 자연스럽게 되물음
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [],
            studentText: `__CLARIFY__:${partialText}`,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          msgEn = data.text
          msgKo = '(잘 못 들었어요. 다시 한 번 말씀해 주시겠어요?)'
        }
      } catch { /* ignore */ }
    }

    // GPT 실패 or 완전 인식 실패 → 기본 메시지
    if (!msgEn) {
      const retryMessages = confidence === 0
        ? [
            { en: "I couldn't hear you clearly. There might be too much background noise. Could you try again?", ko: "잘 못 들었어요. 주변 소음이 많은 것 같아요. 다시 말씀해 주시겠어요?" },
            { en: "I had trouble hearing that. Could you speak a bit louder and try again?", ko: "소리가 잘 안 들렸어요. 조금 더 크게 말씀해 주시겠어요?" },
          ]
        : [
            { en: "Sorry, I couldn't quite hear you. Could you say that again?", ko: "잘 못 들었어요. 다시 한 번 말씀해 주시겠어요?" },
            { en: "I didn't catch that clearly. Could you repeat that, please?", ko: "정확히 듣지 못했어요. 다시 말씀해 주시겠어요?" },
          ]
      const selected = retryMessages[Math.floor(Math.random() * retryMessages.length)]
      msgEn = selected.en
      msgKo = selected.ko
    }

    // 대화창에 표시
    addMessage({
      id: `fallback_${Date.now()}`,
      role: 'ai',
      content: `${msgEn}\n(${msgKo})`,
      createdAt: new Date().toISOString(),
    })

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msgEn, voice: 'nova' }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        await new Promise<void>((resolve) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve() }
          audio.onerror = () => { resolve() }
          audio.play().catch(() => resolve())
        })
      }
    } catch { /* ignore */ }
    setAvatarStatus('idle')
  }, [discardBlob, addLog, addMessage, setAvatarStatus, setInterimText, setInterimWords])

  const handleError = useCallback((error: string) => {
    addLog(`STT 오류: ${error}`, 'error')
    setAvatarStatus('idle')
    discardBlob()
  }, [addLog, setAvatarStatus, discardBlob])

  // useWebSpeech가 연 스트림을 useMediaRecorder와 공유 (마이크 중복 열기 방지)
  const handleStreamReady = useCallback((stream: MediaStream) => {
    startRecording(stream)
  }, [startRecording])

  const { isSupported, isListening, startListening, stopListening } = useWebSpeech({
    onInterimResult: handleInterim,
    onFinalResult: handleFinalResult,
    onFallback: handleFallback,
    onError: handleError,
    onLog: (msg) => addLog(msg, 'info'),
    onStreamReady: handleStreamReady,
  })

  const isTouchRef = useRef(false)  // 터치 이벤트 감지 플래그

  const handleMicStart = useCallback(async () => {
    if (!isSupported) { addLog('Web Speech API 미지원 브라우저', 'error'); return }
    if (isHolding) return  // 이미 누르고 있는 경우 무시
    startTimeRef.current = Date.now()
    sentRef.current = false
    setIsHolding(true)
    setAvatarStatus('listening')
    setInterimText('Coty가 당신의 말을 듣고 있습니다.')
    setInterimWords([])
    addLog('마이크 시작', 'info')
    startListening()
  }, [isSupported, isHolding, startListening, setAvatarStatus, setInterimText, setInterimWords, addLog])

  const handleMicStop = useCallback(async () => {
    if (!isHolding) return  // 이미 중지된 경우 무시
    setIsHolding(false)
    setAvatarStatus('processing')
    setInterimText('Coty가 분석 중입니다...')
    setInterimWords([])
    await stopListening()
  }, [isHolding, stopListening, setAvatarStatus, setInterimText, setInterimWords])

  return (
    <main className="h-[100dvh] bg-slate-950 text-white flex flex-col overflow-hidden">
      <NavBar logCount={logs.length} onLogClick={() => setLogDrawerOpen(!isLogDrawerOpen)} onSettingsClick={() => setShowSettings(true)} />

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
                {/* 학생 메시지 — words 있으면 단어별 색상 표시 */}
                {msg.role === 'student' && msg.words && msg.words.length > 0 ? (
                  <div className="flex flex-wrap gap-x-2 gap-y-1 justify-end">
                    {(() => {
                      // correction과 비교해서 색상 결정
                      const correctionWords = msg.feedback?.correction
                        ? msg.feedback.correction.toLowerCase().replace(/[.,!?]/g, '').split(' ')
                        : null
                      const originalWords = msg.content.toLowerCase().replace(/[.,!?]/g, '').split(' ')

                      return msg.words.map((w, i) => {
                        let color = 'text-emerald-300'  // 기본: 초록
                        if (correctionWords) {
                          // correction이 있으면 — 원문과 비교
                          const originalWord = originalWords[i] || ''
                          const correctedWord = correctionWords[i] || ''
                          // 해당 위치 단어가 다르거나 correction에 없으면 빨강
                          color = originalWord === correctedWord || !correctedWord
                            ? 'text-emerald-300'
                            : 'text-red-300'
                        }
                        // correction 없으면 전부 초록
                        const displayWord = i === 0
                          ? w.word.charAt(0).toUpperCase() + w.word.slice(1)
                          : w.word
                        return (
                          <span key={i} className={cn('text-sm font-medium', color)}>
                            {displayWord}
                          </span>
                        )
                      })
                    })()}
                  </div>
                ) : (
                  <span>{msg.content}</span>
                )}
                {/* AI 메시지 — 한국어 번역 */}
                {msg.role === 'ai' && msg.translation && (
                  <p className="text-xs text-violet-300/70 mt-2 pt-2 border-t border-violet-700/30">
                    {msg.translation}
                  </p>
                )}
              </div>

              {/* 인라인 피드백 — 학생 메시지 바로 아래, show_feedback ON일 때만 */}
              {msg.role === 'student' && msg.feedback && settings.show_feedback && (
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

          {/* 실시간 자막 */}
          {(isSpeaking || isHolding || interimText) && (
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
              ) : isHolding ? (
                // 마이크 누르고 있는 중 — Coty 듣는 중 메시지
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0,1,2,3].map(i => (
                      <div key={i} className="w-1 bg-emerald-400 rounded-full animate-pulse"
                        style={{ height: `${8 + i * 3}px`, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <p className="text-emerald-300 text-sm">Coty가 당신의 말을 듣고 있습니다.</p>
                </div>
              ) : interimWords.length > 0 ? (
                <div className="space-y-1">
                  <WordConfidenceDisplay words={interimWords} />
                  <span className="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full ml-1 animate-pulse align-middle" />
                </div>
              ) : (
                <p className="text-slate-400 text-sm leading-relaxed">
                  {interimText}
                  <span className="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full ml-2 animate-pulse align-middle" />
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
              onClick={async () => {
                if (!internalBlobUrl) return
                if (isPlaying && audioRef.current) {
                  audioRef.current.pause()
                  audioRef.current.currentTime = 0
                  setIsPlaying(false)
                  return
                }
                try {
                  const audio = new Audio(internalBlobUrl)
                  audioRef.current = audio
                  audio.onended = () => setIsPlaying(false)
                  audio.onerror = () => setIsPlaying(false)
                  setIsPlaying(true)
                  await audio.play()
                } catch (e) {
                  console.error('재생 실패:', e)
                  setIsPlaying(false)
                }
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
              onMouseDown={(e) => {
                if (isTouchRef.current) return  // 터치 이벤트 후 발생하는 마우스 이벤트 무시
                e.preventDefault()
                handleMicStart()
              }}
              onMouseUp={(e) => {
                if (isTouchRef.current) return
                e.preventDefault()
                handleMicStop()
              }}
              onMouseLeave={(e) => {
                if (isTouchRef.current) return
                if (isHolding) handleMicStop()  // 마우스가 버튼 밖으로 나가면 정지
              }}
              onTouchStart={(e) => {
                e.preventDefault()
                isTouchRef.current = true
                handleMicStart()
              }}
              onTouchEnd={(e) => {
                e.preventDefault()
                handleMicStop()
                // 300ms 후 터치 플래그 해제
                setTimeout(() => { isTouchRef.current = false }, 300)
              }}
              onTouchCancel={(e) => {
                e.preventDefault()
                handleMicStop()
                setTimeout(() => { isTouchRef.current = false }, 300)
              }}
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

      {/* 설정 모달 */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onUpdate={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

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
