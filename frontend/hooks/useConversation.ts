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
  hintUsed?: boolean
}

interface UseConversationProps {
  sessionId?: string | null
  studentId?: string
  studentNickname?: string | null
  ttsSpeed?: 'slow' | 'normal' | 'fast'
  currentBook?: string
  currentUnit?: number
  onBookUnitChange?: (book: string, unit: number) => void
}

// 대화 단계
type LessonPhase = 'greeting' | 'weather' | 'review' | 'confirm_unit' | 'study'

const TTS_SPEED_MAP = { slow: 0.75, normal: 1.0, fast: 1.25 }

export function useConversation({
  sessionId, studentId, studentNickname,
  ttsSpeed = 'normal',
  currentBook, currentUnit,
  onBookUnitChange,
}: UseConversationProps = {}) {
  const { addMessage, setAIResponding, updateMessageFeedback } = useUIStore()
  const { setAvatarStatus } = useAudioStore()
  const historyRef = useRef<Message[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackData | null>(null)
  const [lessonPhase, setLessonPhase] = useState<LessonPhase>('greeting')
  const [progress, setProgress] = useState(0)

  // 리포트 추적
  const reportIdRef = useRef<string | null>(null)
  const totalTurnsRef = useRef(0)
  const correctTurnsRef = useRef(0)
  const hintUsedCountRef = useRef(0)
  const grammarScoresRef = useRef<number[]>([])
  const fluencyScoresRef = useRef<number[]>([])
  const vocabScoresRef = useRef<number[]>([])
  const overallScoresRef = useRef<number[]>([])
  const correctionsRef = useRef<string[]>([])

  // refs
  const ttsSpeedRef = useRef(ttsSpeed)
  const currentBookRef = useRef(currentBook)
  const currentUnitRef = useRef(currentUnit)
  const lessonPhaseRef = useRef<LessonPhase>('greeting')
  const onBookUnitChangeRef = useRef(onBookUnitChange)

  useEffect(() => { ttsSpeedRef.current = ttsSpeed }, [ttsSpeed])
  useEffect(() => { currentBookRef.current = currentBook }, [currentBook])
  useEffect(() => { currentUnitRef.current = currentUnit }, [currentUnit])
  useEffect(() => { onBookUnitChangeRef.current = onBookUnitChange }, [onBookUnitChange])

  const addMessageRef = useRef(addMessage)
  const speakRef = useRef<(text: string) => Promise<void>>(async () => {})
  useEffect(() => { addMessageRef.current = addMessage }, [addMessage])

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
      audio.playbackRate = TTS_SPEED_MAP[ttsSpeedRef.current] ?? 1.0
      await new Promise<void>((resolve) => {
        audio.onended = () => { URL.revokeObjectURL(url); setIsSpeaking(false); setAvatarStatus('idle'); resolve() }
        audio.onerror = () => { setIsSpeaking(false); setAvatarStatus('idle'); resolve() }
        audio.play().catch(() => { setIsSpeaking(false); setAvatarStatus('idle'); resolve() })
      })
    } catch {
      setIsSpeaking(false)
      setAvatarStatus('idle')
    }
  }, [setAvatarStatus])

  useEffect(() => { speakRef.current = speak }, [speak])

  // 인사말 — 날씨 질문만 (짧게!)
  useEffect(() => {
    if (!studentNickname) return
    const greetedKey = `greeted_${studentNickname}`
    if (sessionStorage.getItem(greetedKey)) return
    sessionStorage.setItem(greetedKey, '1')

    const timer = setTimeout(async () => {
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [],
            studentText: `__GREETING__:${studentNickname}`,
            currentBook: currentBookRef.current,
            currentUnit: currentUnitRef.current,
            phase: 'greeting',
          }),
        })
        if (!res.ok) throw new Error()
        const data = await res.json()
        const greetingText = data.text

        historyRef.current.push({ role: 'assistant', content: greetingText })
        lessonPhaseRef.current = 'weather'
        setLessonPhase('weather')

        // 학습 로그 + 리포트 생성
        if (currentBookRef.current && currentUnitRef.current) {
          // study_logs 저장
          fetch('/api/study-log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              student_id: studentId,
              session_id: sessionId,
              book: currentBookRef.current,
              unit: currentUnitRef.current,
              unit_title: data.unitTitle || '',
            }),
          })
          // lesson_report 생성
          fetch('/api/lesson-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'start',
              student_id: studentId,
              session_id: sessionId,
              book: currentBookRef.current,
              unit: currentUnitRef.current,
              unit_title: data.unitTitle || '',
            }),
          }).then(r => r.json()).then(d => {
            if (d.report_id) reportIdRef.current = d.report_id
          })
        }

        await speakRef.current(greetingText)
        addMessageRef.current({ id: 'greeting', role: 'ai', content: greetingText, createdAt: new Date().toISOString() })
      } catch {
        const fallback = `Hi ${studentNickname}! How's the weather today?`
        historyRef.current.push({ role: 'assistant', content: fallback })
        lessonPhaseRef.current = 'weather'
        setLessonPhase('weather')
        await speakRef.current(fallback)
        addMessageRef.current({ id: 'greeting', role: 'ai', content: fallback, createdAt: new Date().toISOString() })
      }
    }, 300)
    return () => clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentNickname])

  // 페이지 종료 시 리포트 마무리
  useEffect(() => {
    return () => {
      if (reportIdRef.current && totalTurnsRef.current > 0) {
        fetch('/api/lesson-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'finish',
            report_id: reportIdRef.current,
            conversation_history: historyRef.current
              .map(m => `${m.role}: ${m.content}`).join('\n'),
            book: currentBookRef.current,
            unit: currentUnitRef.current,
            unit_title: '',
            progress: 0,
            corrections: correctionsRef.current.join(', '),
          }),
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])role: 'student' | 'ai', content: string, extra?: Record<string, unknown>) => {
    try {
      await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId || null, student_id: studentId || null, role, content, ...extra }),
      })
    } catch { }
  }, [sessionId, studentId])

  const sendToGPT = useCallback(async (
    studentText: string,
    meta?: ConversationMeta,
    words?: WordResult[]
  ) => {
    let resolveLogId: (id: string | null) => void = () => {}
    const logIdPromise = new Promise<string | null>((resolve) => { resolveLogId = resolve })

    // 학생 메시지 UI 추가
    const studentMsgId = Date.now().toString()
    addMessage({ id: studentMsgId, role: 'student', content: studentText, createdAt: new Date().toISOString(), words })
    historyRef.current.push({ role: 'user', content: studentText })

    // 피드백 요청 (greeting 제외 모든 phase)
    if (lessonPhaseRef.current !== 'greeting') {
      fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: studentText, conversationHistory: historyRef.current.slice(-6) }),
      }).then(async (res) => {
        if (!res.ok) { resolveLogId(null); return }
        const feedbackData = await res.json()
        setFeedback(feedbackData)
        updateMessageFeedback(studentMsgId, feedbackData)

        // 점수 누적
        if (feedbackData.grammar) grammarScoresRef.current.push(feedbackData.grammar)
        if (feedbackData.fluency) fluencyScoresRef.current.push(feedbackData.fluency)
        if (feedbackData.vocabulary) vocabScoresRef.current.push(feedbackData.vocabulary)
        if (feedbackData.overall) overallScoresRef.current.push(feedbackData.overall)
        if (feedbackData.correction) correctionsRef.current.push(feedbackData.correction)
        if (meta?.hintUsed) hintUsedCountRef.current++

        // 완성도 있는 답변 여부 (overall 70 이상)
        if (feedbackData.overall >= 70) correctTurnsRef.current++
        totalTurnsRef.current++

        const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : undefined

        // report 업데이트
        if (reportIdRef.current) {
          fetch('/api/lesson-report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'update',
              report_id: reportIdRef.current,
              total_turns: totalTurnsRef.current,
              correct_turns: correctTurnsRef.current,
              hint_used_count: hintUsedCountRef.current,
              avg_grammar: avg(grammarScoresRef.current),
              avg_fluency: avg(fluencyScoresRef.current),
              avg_vocabulary: avg(vocabScoresRef.current),
              avg_overall: avg(overallScoresRef.current),
            }),
          })
        }
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
            hint_used: meta?.hintUsed ?? false,
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
      }).catch(() => resolveLogId(null))
    } else {
      resolveLogId(null)
    }

    setAIResponding(true)
    setAvatarStatus('processing')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyRef.current.slice(-10),
          studentText,
          withTranslation: true,  // 항상 번역 요청
          currentBook: currentBookRef.current,
          currentUnit: currentUnitRef.current,
          phase: lessonPhaseRef.current,
        }),
      })
      if (!res.ok) throw new Error('GPT 응답 실패')
      const data = await res.json()
      const aiText = data.text
      const translation = data.translation || ''

      // phase 업데이트
      if (data.nextPhase && data.nextPhase !== lessonPhaseRef.current) {
        lessonPhaseRef.current = data.nextPhase
        setLessonPhase(data.nextPhase)
      }

      // 진행률 업데이트 (절대 낮아지지 않음)
      if (data.progress !== null && data.progress !== undefined) {
        setProgress(prev => {
          const newProgress = Math.max(prev, data.progress)
          // report에 progress 저장
          if (reportIdRef.current && newProgress > prev) {
            fetch('/api/lesson-report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'update',
                report_id: reportIdRef.current,
                progress: newProgress,
              }),
            })
          }
          // 100% 달성 시 최종 요약 생성
          if (newProgress >= 100 && prev < 100 && reportIdRef.current) {
            fetch('/api/lesson-report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'finish',
                report_id: reportIdRef.current,
                conversation_history: historyRef.current
                  .map(m => `${m.role}: ${m.content}`).join('\n'),
                book: currentBookRef.current,
                unit: currentUnitRef.current,
                unit_title: '',
                progress: newProgress,
                corrections: correctionsRef.current.join(', '),
              }),
            })
          }
          return newProgress
        })
      }

      // unit 변경 처리
      if (data.newUnit && data.newUnit !== currentUnitRef.current) {
        const newUnit = data.newUnit
        const newBook = data.newBook || currentBookRef.current || ''
        currentUnitRef.current = newUnit
        currentBookRef.current = newBook
        onBookUnitChangeRef.current?.(newBook, newUnit)
        // DB 업데이트
        fetch('/api/study-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: studentId,
            session_id: sessionId,
            book: newBook,
            unit: newUnit,
          }),
        })
      }

      historyRef.current.push({ role: 'assistant', content: aiText })
      setAIResponding(false)
      await speak(aiText)

      addMessageRef.current({
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: aiText,
        translation: translation || undefined,
        choices: data.choices?.length ? data.choices : undefined,
        createdAt: new Date().toISOString(),
      })

      // 로그 저장
      const logId = await logIdPromise
      if (logId) {
        fetch('/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ log_id: logId, ai_text: aiText }),
        })
      } else if (lessonPhaseRef.current !== 'study') {
        saveLog('ai', aiText)
      }

    } catch {
      setAIResponding(false)
      setAvatarStatus('idle')
      resolveLogId!(null)
    }
  }, [addMessage, setAIResponding, setAvatarStatus, speak, updateMessageFeedback, sessionId, studentId, saveLog])

  return {
    sendToGPT, isSpeaking, stopSpeaking, feedback,
    clearFeedback: () => setFeedback(null),
    lessonPhase, progress,
  }
}
