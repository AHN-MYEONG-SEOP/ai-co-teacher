'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useAudioStore } from '@/store/audioStore'
import type { FeedbackData } from '@/components/student/FeedbackCard'

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
}

export function useConversation({ sessionId, studentId, studentNickname }: UseConversationProps = {}) {
  const { addMessage, setAIResponding, updateMessageFeedback } = useUIStore()
  const { setAvatarStatus } = useAudioStore()
  const historyRef = useRef<Message[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackData | null>(null)
  const greetedRef = useRef(false)

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
      audio.onended = () => { URL.revokeObjectURL(url); setIsSpeaking(false); setAvatarStatus('idle') }
      audio.onerror = () => { setIsSpeaking(false); setAvatarStatus('idle') }
      await audio.play()
    } catch {
      setIsSpeaking(false)
      setAvatarStatus('idle')
    }
  }, [setAvatarStatus])

  // 인사말 — 세션 시작 시 한 번만
  useEffect(() => {
    if (!studentNickname) return
    const greetedKey = `greeted_${studentNickname}`
    if (sessionStorage.getItem(greetedKey)) return  // sessionStorage만 체크
    sessionStorage.setItem(greetedKey, '1')  // 먼저 등록해서 중복 방지

    const greet = async () => {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: [], studentText: `__GREETING__:${studentNickname}` }),
        })
        if (!res.ok) throw new Error()
        const data = await res.json()
        const greetingText = data.text
        addMessage({ id: 'greeting', role: 'ai', content: greetingText, createdAt: new Date().toISOString() })
        historyRef.current.push({ role: 'assistant', content: greetingText })
        fetch('/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId || null, student_id: studentId || null, ai_text: greetingText }),
        })
        await speak(greetingText)
      } catch {
        const fallback = `Hi ${studentNickname}! Great to see you. Are you ready to practice your English today?`
        addMessage({ id: 'greeting', role: 'ai', content: fallback, createdAt: new Date().toISOString() })
        historyRef.current.push({ role: 'assistant', content: fallback })
        await speak(fallback)
      }
    }
    const timer = setTimeout(greet, 800)
    return () => clearTimeout(timer)
  }, [studentNickname, addMessage, speak, sessionId, studentId])

  const sendToGPT = useCallback(async (
    studentText: string,
    meta?: ConversationMeta
  ) => {
    // 이번 턴의 log_id를 저장할 Promise resolve 함수
    let resolveLogId: (id: string | null) => void = () => {}
    const logIdPromise = new Promise<string | null>((resolve) => { resolveLogId = resolve })

    // 1. 학생 메시지 UI 추가
    const studentMsgId = Date.now().toString()
    addMessage({ id: studentMsgId, role: 'student', content: studentText, createdAt: new Date().toISOString() })
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
        body: JSON.stringify({ messages: historyRef.current.slice(-10), studentText }),
      })
      if (!res.ok) throw new Error('GPT 응답 실패')
      const data = await res.json()
      const aiText = data.text

      addMessage({ id: (Date.now() + 1).toString(), role: 'ai', content: aiText, createdAt: new Date().toISOString() })
      historyRef.current.push({ role: 'assistant', content: aiText })

      // 4. log_id 기다렸다가 ai_text 업데이트
      const logId = await logIdPromise
      if (logId) {
        // 기존 row에 ai_text 추가
        fetch('/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ log_id: logId, ai_text: aiText }),
        })
      } else {
        // 피드백 실패 등으로 log_id 없으면 ai_text만 별도 row
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

      setAIResponding(false)
      await speak(aiText)

    } catch {
      setAIResponding(false)
      setAvatarStatus('idle')
      resolveLogId!(null)
    }

    await feedbackPromise
  }, [addMessage, setAIResponding, setAvatarStatus, speak, updateMessageFeedback, sessionId, studentId])

  return { sendToGPT, isSpeaking, stopSpeaking, feedback, clearFeedback: () => setFeedback(null) }
}
