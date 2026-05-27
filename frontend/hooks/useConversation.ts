'use client'

import { useCallback, useRef, useState } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useAudioStore } from '@/store/audioStore'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export function useConversation() {
  const { addMessage, setAIResponding } = useUIStore()
  const { setAvatarStatus } = useAudioStore()
  const historyRef = useRef<Message[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)

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

  const sendToGPT = useCallback(async (studentText: string) => {
    // 학생 메시지 UI에 추가
    addMessage({
      id: Date.now().toString(),
      role: 'student',
      content: studentText,
      createdAt: new Date().toISOString(),
    })

    // 히스토리에 추가
    historyRef.current.push({ role: 'user', content: studentText })

    setAIResponding(true)
    setAvatarStatus('processing')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyRef.current.slice(-10), // 최근 10개만 유지
          studentText,
        }),
      })

      if (!res.ok) throw new Error('GPT 응답 실패')

      const data = await res.json()
      const aiText = data.text

      // AI 메시지 UI에 추가
      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: aiText,
        createdAt: new Date().toISOString(),
      })

      // 히스토리에 AI 응답 추가
      historyRef.current.push({ role: 'assistant', content: aiText })

      setAIResponding(false)

      // TTS로 음성 재생
      await speak(aiText)

    } catch {
      setAIResponding(false)
      setAvatarStatus('idle')
    }
  }, [addMessage, setAIResponding, setAvatarStatus, speak])

  return { sendToGPT, isSpeaking, stopSpeaking }
}
