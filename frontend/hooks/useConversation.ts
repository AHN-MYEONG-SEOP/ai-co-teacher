'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useAudioStore } from '@/store/audioStore'
import type { FeedbackData } from '@/components/student/FeedbackCard'
import type { WordResult } from '@/types'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface ConversationMeta {
  sttPath?: string
  confidence?: number
  latencyMs?: number
}

interface UseConversationProps {
  sessionId?: string | null
  studentId?: string
  studentNickname?: string | null
  ttsSpeed?: 'slow' | 'normal' | 'fast'
  showTranslation?: boolean
  currentBook?: string
  currentUnit?: number
}

const TTS_SPEED_MAP = { slow: 0.75, normal: 1.0, fast: 1.25 }

export function useConversation({ sessionId, studentId, studentNickname, ttsSpeed = 'normal', showTranslation = false, currentBook, currentUnit }: UseConversationProps = {}) {
  const { addMessage, setAIResponding, updateMessageFeedback } = useUIStore()
  const { setAvatarStatus } = useAudioStore()
  const historyRef = useRef<Message[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackData | null>(null)
  const greetedRef = useRef(false)
  const ttsSpeedRef = useRef(ttsSpeed)
  const showTranslationRef = useRef(showTranslation)
  useEffect(() => { ttsSpeedRef.current = ttsSpeed }, [ttsSpeed])
  useEffect(() => { showTranslationRef.current = showTranslation }, [showTranslation])

  const stopSpeaking = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setIsSpeaking(false)
      setAvatarStatus('idle')
    }
  }, [setAvatarStatus])

  const speak = useCallback(async (text: string) => {
    try {
      setIsSpeaking(true)
      setAvatarStatus('speaking')
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'nova' }),
      })
      if (!res.ok) throw new Error('TTS 실패')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      if (audioRef.current) {
        audioRef.current.pause()
        URL.revokeObjectURL(audioRef.current.src)
      }
      const audio = new Audio(url)
      audioRef.current = audio
      // 속도 적용
      audio.playbackRate = TTS_SPEED_MAP[ttsSpeedRef.current] ?? 1.0

      // 재생 완료까지 기다리는 Promise
      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url)
          setIsSpeaking(false)
          setAvatarStatus('idle')
          resolve()
        }
        audio.onerror = () => {
          setIsSpeaking(false)
          setAvatarStatus('idle')
          resolve()
        }
        audio.play().catch(() => {
          setIsSpeaking(false)
          setAvatarStatus('idle')
          resolve()
        })
      })
    } catch {
      setIsSpeaking(false)
      setAvatarStatus('idle')
    }
  }, [setAvatarStatus])

  // addMessage, speak를 ref로 저장 (useEffect 의존성에서 제거)
  const addMessageRef = useRef(addMessage)
  const speakRef = useRef(speak)
  useEffect(() => { addMessageRef.current = addMessage }, [addMessage])
  useEffect(() => { speakRef.current = speak }, [speak])

  // 인사말 — studentNickname이 처음 설정될 때 한 번만
  useEffect(() => {
    if (!studentNickname) return
    const greetedKey = `greeted_${studentNickname}`
    if (sessionStorage.getItem(greetedKey)) return
    sessionStorage.setItem(greetedKey, '1')

    // 즉시 환영 텍스트 표시 (TTS 없이)
    addMessageRef.current({
      id: 'welcome',
      role: 'ai',
      content: 'AI Co-Teacher 오신 것을 환영합니다. 🎙️',
      createdAt: new Date().toISOString(),
    })

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [],
            studentText: `__GREETING__:${studentNickname}`,
            currentBook,
            currentUnit,
          }),
        })
        if (!res.ok) throw new Error()
        const data = await res.json()
        const greetingText = data.text
        historyRef.current.push({ role: 'assistant', content: greetingText })

        // 학습 로그 저장
        if (currentBook && currentUnit) {
          fetch('/api/study-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student_id: studentId,
              session_id: sessionId,
              book: currentBook,
              unit: currentUnit,
              unit_title: data.unitTitle || '',
            }),
          })
        }

        fetch('/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId || null, student_id: studentId || null, ai_text: greetingText }),
        })
        await speakRef.current(greetingText)
        addMessageRef.current({ id: 'greeting', role: 'ai', content: greetingText, createdAt: new Date().toISOString() })
      } catch {
        const fallback = `Hi ${studentNickname}! Great to see you. Are you ready to practice your English today?`
        historyRef.current.push({ role: 'assistant', content: fallback })
        await speakRef.current(fallback)
        addMessageRef.current({ id: 'greeting', role: 'ai', content: fallback, createdAt: new Date().toISOString() })
      }
    }, 300)

    // cleanup 없음 — 타이머 취소 안 함
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentNickname])

  const sendToGPT = useCallback(async (
    studentText: string,
    meta?: ConversationMeta,
    words?: WordResult[]
  ) => {
    let resolveLogId: (id: string | null) => void = () => {}
    const logIdPromise = new Promise<string | null>((resolve) => { resolveLogId = resolve })

    // 1. 학생 메시지 UI 추가 (words 포함)
    const studentMsgId = Date.now().toString()
    addMessage({ id: studentMsgId, role: 'student', content: studentText, createdAt: new Date().toISOString(), words })
    historyRef.current.push({ role: 'user', content: studentText })

    // 2. 피드백 + 학생 발화 로그 저장 (병렬, log_id 반환)
    const feedbackPromise = (async () => {
      try {
        const res = await fetch('/api/feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: studentText,
            conversationHistory: historyRef.current.slice(-6),
          }),
        })
        if (!res.ok) { resolveLogId(null); return }
        const feedbackData = await res.json()
        setFeedback(feedbackData)
        updateMessageFeedback(studentMsgId, feedbackData)

        // 학생 발화 row 저장 → log_id 획득
        const logRes = await fetch('/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId || null,
            student_id: studentId || null,
            student_text: studentText,
            stt_path: meta?.sttPath,
            confidence: meta?.confidence,
            latency_ms: meta?.latencyMs,
            grammar: feedbackData.grammar,
            fluency: feedbackData.fluency,
            vocabulary: feedbackData.vocabulary,
            overall: feedbackData.overall,
            correction: feedbackData.correction,
            tip: feedbackData.tip,
          }),
        })
        const logData = await logRes.json()
        resolveLogId(logData.log_id || null)
      } catch {
        resolveLogId(null)
      }
    })()

    // 3. GPT 응답 요청 (피드백과 병렬)
    setAIResponding(true)
    setAvatarStatus('processing')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyRef.current.slice(-10),
          studentText,
          withTranslation: showTranslationRef.current,
        }),
      })
      if (!res.ok) throw new Error('GPT 응답 실패')
      const data = await res.json()
      const aiText = data.text
      const translation = data.translation || ''

      // TTS 먼저 재생 — 듣기 연습
      historyRef.current.push({ role: 'assistant', content: aiText })
      setAIResponding(false)
      await speak(aiText)

      // 재생 완료 후 텍스트 + 번역 표시
      addMessageRef.current({
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: aiText,
        translation: translation || undefined,
        createdAt: new Date().toISOString(),
      })

      // 4. log_id 기다렸다가 ai_text 업데이트
      const logId = await logIdPromise
      if (logId) {
        fetch('/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ log_id: logId, ai_text: aiText }),
        })
      } else {
        fetch('/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: sessionId || null,
            student_id: studentId || null,
            student_text: studentText,
            ai_text: aiText,
          }),
        })
      }

    } catch {
      setAIResponding(false)
      setAvatarStatus('idle')
      resolveLogId!(null)
    }

    await feedbackPromise
  }, [addMessage, setAIResponding, setAvatarStatus, speak, updateMessageFeedback, sessionId, studentId])

  return { sendToGPT, isSpeaking, stopSpeaking, feedback, clearFeedback: () => setFeedback(null) }
}
