'use client'

import { useCallback, useRef, useState } from 'react'
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
}

export function useConversation({ sessionId, studentId }: UseConversationProps = {}) {
  const { addMessage, setAIResponding } = useUIStore()
  const { setAvatarStatus } = useAudioStore()
  const historyRef = useRef<Message[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackData | null>(null)

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

      audio.onended = () => {
        URL.revokeObjectURL(url)
        setIsSpeaking(false)
        setAvatarStatus('idle')
      }

      audio.onerror = () => {
        setIsSpeaking(false)
        setAvatarStatus('idle')
      }

      await audio.play()
    } catch {
      setIsSpeaking(false)
      setAvatarStatus('idle')
    }
  }, [setAvatarStatus])

  // 대화 로그 Supabase 저장
  const saveLog = useCallback(async (
    role: 'student' | 'ai',
    content: string,
    extra?: { stt_path?: string; confidence?: number; latency_ms?: number }
  ) => {
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId || null,
          student_id: studentId || null,
          role,
          content,
          ...extra,
        }),
      })
    } catch {
      // 로그 저장 실패는 무시
    }
  }, [sessionId, studentId])

  // 피드백 요청
  const requestFeedback = useCallback(async (text: string) => {
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) return
      const data = await res.json()
      setFeedback(data)
    } catch {
      // 피드백 실패는 무시
    }
  }, [])

  const sendToGPT = useCallback(async (
    studentText: string,
    meta?: ConversationMeta
  ) => {
    addMessage({
      id: Date.now().toString(),
      role: 'student',
      content: studentText,
      createdAt: new Date().toISOString(),
    })

    historyRef.current.push({ role: 'user', content: studentText })

    // 피드백 + 로그 병렬 실행
    requestFeedback(studentText)
    saveLog('student', studentText, {
      stt_path: meta?.sttPath,
      confidence: meta?.confidence,
      latency_ms: meta?.latencyMs,
    })

    setAIResponding(true)
    setAvatarStatus('processing')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyRef.current.slice(-10),
          studentText,
        }),
      })

      if (!res.ok) throw new Error('GPT 응답 실패')

      const data = await res.json()
      const aiText = data.text

      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: aiText,
        createdAt: new Date().toISOString(),
      })

      historyRef.current.push({ role: 'assistant', content: aiText })
      saveLog('ai', aiText)

      setAIResponding(false)
      await speak(aiText)

    } catch {
      setAIResponding(false)
      setAvatarStatus('idle')
    }
  }, [addMessage, setAIResponding, setAvatarStatus, speak, requestFeedback, saveLog])

  return { sendToGPT, isSpeaking, stopSpeaking, feedback, clearFeedback: () => setFeedback(null) }
}
