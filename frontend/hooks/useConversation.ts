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

// ── 수업 시나리오 (lesson_scenarios 공용 템플릿, 지시서 스키마) ──
export interface ScenarioStep {
  step: number
  target_word?: string
  distance?: string
  scene_kr?: string
  ai_line?: string
  expected_pattern?: string
  accept_variants?: string[]
  hint_line?: string
  reaction?: string
}
export interface ScenarioPhase {
  phase: number
  label?: string
  description?: string
  steps: ScenarioStep[]
}
export interface LessonScenario {
  id: string
  book: string
  book_slug: string
  unit: number
  title?: string | null
  target_words: string[]
  target_patterns: string[]
  total_steps: number
  phases: ScenarioPhase[]
  closing: unknown
  gpt_rules: unknown
}

// ── 진도 (lesson_progress, 지시서 스키마) ─────────────────
export interface StepProgress {
  current_step: number
  completed_steps: number[]
  natural_steps: number[]
  hint_used_steps: number[]
  progress_rate: number
  completed: boolean
}

const EMPTY_PROGRESS: StepProgress = {
  current_step: 1,
  completed_steps: [],
  natural_steps: [],
  hint_used_steps: [],
  progress_rate: 0,
  completed: false,
}

interface UseConversationProps {
  sessionId?: string | null
  studentId?: string
  studentNickname?: string | null
  ttsSpeed?: 'slow' | 'normal' | 'fast'
  currentBook?: string
  currentUnit?: number
  persona?: Record<string, unknown> | null
  scenario?: LessonScenario | null
  initialProgress?: StepProgress | null
  progressId?: string | null
  onUnitComplete?: () => void   // 한 회차의 모든 step 완료 시 (완료 선택 카드 트리거)
}

// start() 호출 시 넘기는 현재 회차 정보 (refs 갱신 지연 회피용 명시 인자)
export interface StartLessonArgs {
  scenario: LessonScenario | null
  progressId: string | null
  book: string
  unit: number
}

const TTS_SPEED_MAP = { slow: 0.75, normal: 1.0, fast: 1.25 }

export function useConversation({
  sessionId, studentId, studentNickname,
  ttsSpeed = 'normal',
  currentBook, currentUnit,
  persona, scenario, initialProgress,
  progressId, onUnitComplete,
}: UseConversationProps = {}) {
  const { addMessage, setAIResponding, updateMessageFeedback } = useUIStore()
  const { setAvatarStatus } = useAudioStore()
  const historyRef = useRef<Message[]>([])
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [feedback, setFeedback] = useState<FeedbackData | null>(null)
  const [sessionEnded, setSessionEnded] = useState(false)
  // AI 발화 전 보여줄 한국어 상황 설명 (새 step 진입 시에만, step 번호 포함)
  const [currentScene, setCurrentScene] = useState<{ step: number; text: string } | null>(null)
  const [progress, setProgress] = useState(initialProgress?.progress_rate ?? 0)
  const [stepProgress, setStepProgress] = useState<StepProgress>(initialProgress ?? EMPTY_PROGRESS)

  // 페르소나 + 시나리오/진도 refs
  const personaRef = useRef<Record<string, unknown> | null>(persona ?? null)
  const scenarioRef = useRef<LessonScenario | null>(scenario ?? null)
  const stepProgressRef = useRef<StepProgress>(initialProgress ?? EMPTY_PROGRESS)

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
  const progressIdRef = useRef<string | null>(progressId ?? null)
  const onUnitCompleteRef = useRef(onUnitComplete)
  const unitCompleteFiredRef = useRef(false)   // 현재 회차에서 완료 콜백 1회만 발화
  const greetedRef = useRef(false)

  useEffect(() => { ttsSpeedRef.current = ttsSpeed }, [ttsSpeed])
  useEffect(() => { currentBookRef.current = currentBook }, [currentBook])
  useEffect(() => { currentUnitRef.current = currentUnit }, [currentUnit])
  useEffect(() => { progressIdRef.current = progressId ?? null }, [progressId])
  useEffect(() => { onUnitCompleteRef.current = onUnitComplete }, [onUnitComplete])
  useEffect(() => { personaRef.current = persona ?? null }, [persona])
  useEffect(() => { scenarioRef.current = scenario ?? null }, [scenario])
  // 시나리오 도착 시 초기 진도 반영 (수업 시작 전 백그라운드 로드)
  useEffect(() => {
    if (!initialProgress) return
    stepProgressRef.current = initialProgress
    setStepProgress(initialProgress)
    setProgress(prev => Math.max(prev, initialProgress.progress_rate))
  }, [initialProgress])

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

  // 한 회차의 누적 상태(대화 이력·점수·리포트)를 초기화 — "한 번 더"/"다음 Unit" 시작 전 호출
  const reset = useCallback(() => {
    historyRef.current = []
    greetedRef.current = false
    unitCompleteFiredRef.current = false
    reportIdRef.current = null
    totalTurnsRef.current = 0
    correctTurnsRef.current = 0
    hintUsedCountRef.current = 0
    grammarScoresRef.current = []
    fluencyScoresRef.current = []
    vocabScoresRef.current = []
    overallScoresRef.current = []
    correctionsRef.current = []
    setFeedback(null)
    setSessionEnded(false)
    setCurrentScene(null)
    setProgress(0)
    setStepProgress(EMPTY_PROGRESS)
    stepProgressRef.current = EMPTY_PROGRESS
  }, [])

  // 오늘 수업 종료 (마이크 비활성화)
  const endSession = useCallback(() => {
    setSessionEnded(true)
  }, [])

  // 수업 시작 — 학생이 "시작하기"/"한 번 더"/Unit 선택 후 호출
  // 시나리오 첫 step의 ai_line 으로 오프닝(없으면 일반 인사). 회차 정보는 명시 인자로 받아 ref 갱신.
  const start = useCallback(async (a: StartLessonArgs) => {
    if (!studentNickname || greetedRef.current) return
    greetedRef.current = true

    // 현재 회차 정보를 refs에 즉시 반영 (이후 sendToGPT가 정확한 scenario/progressId 사용)
    scenarioRef.current = a.scenario
    progressIdRef.current = a.progressId
    currentBookRef.current = a.book
    currentUnitRef.current = a.unit

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [],
          studentText: `__GREETING__:${studentNickname}`,
          scenarioId: a.scenario?.id ?? null,
          nickname: studentNickname,
          currentBook: a.book,
          currentUnit: a.unit,
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const greetingText = data.message || data.text
      const sceneKr: string = data.scene_kr || ''
      const sceneStep: number = data.scene_step || 0

      historyRef.current.push({ role: 'assistant', content: greetingText })

      // 학습 로그 + 리포트 생성 (회차마다 새 리포트)
      if (a.book && a.unit) {
        fetch('/api/study-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: studentId,
            session_id: sessionId,
            book: a.book,
            unit: a.unit,
            unit_title: data.unitTitle || a.scenario?.title || '',
          }),
        })
        fetch('/api/lesson-report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'start',
            student_id: studentId,
            session_id: sessionId,
            book: a.book,
            unit: a.unit,
            unit_title: data.unitTitle || a.scenario?.title || '',
          }),
        }).then(r => r.json()).then(d => {
          if (d.report_id) reportIdRef.current = d.report_id
        })
      }

      // 상황 설명을 먼저 보여준 뒤 Coty가 말하도록
      if (sceneKr) setCurrentScene({ step: sceneStep, text: sceneKr })
      await speakRef.current(greetingText)
      addMessageRef.current({
        id: `greeting_${Date.now()}`, role: 'ai', content: greetingText,
        hintLine: data.hint_line || undefined,
        acceptVariants: data.accept_variants?.length ? data.accept_variants : undefined,
        sceneKr: sceneKr || undefined,
        sceneStep: sceneKr ? sceneStep : undefined,
        createdAt: new Date().toISOString(),
      })
      setCurrentScene(null)
    } catch {
      const fallback = `Hi ${studentNickname}! Are you ready to start?`
      historyRef.current.push({ role: 'assistant', content: fallback })
      await speakRef.current(fallback)
      addMessageRef.current({ id: `greeting_${Date.now()}`, role: 'ai', content: fallback, createdAt: new Date().toISOString() })
    }
  }, [studentNickname, studentId, sessionId])

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
            unit_title: scenarioRef.current?.title || '',
            progress: stepProgressRef.current.progress_rate,
            corrections: correctionsRef.current.join(', '),
          }),
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

    // 피드백 요청 (학생 발화마다)
    fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: studentText, conversationHistory: historyRef.current.slice(-6) }),
    }).then(async (res) => {
      if (!res.ok) {
        console.error(`❌ 피드백 요청 실패: ${res.status}`)
        resolveLogId(null)
        return
      }
      const feedbackData = await res.json()
      setFeedback(feedbackData)
      updateMessageFeedback(studentMsgId, feedbackData)

      if (feedbackData.grammar) grammarScoresRef.current.push(feedbackData.grammar)
      if (feedbackData.fluency) fluencyScoresRef.current.push(feedbackData.fluency)
      if (feedbackData.vocabulary) vocabScoresRef.current.push(feedbackData.vocabulary)
      if (feedbackData.overall) overallScoresRef.current.push(feedbackData.overall)
      if (feedbackData.correction) correctionsRef.current.push(feedbackData.correction)
      if (meta?.hintUsed) hintUsedCountRef.current++

      if (feedbackData.overall >= 70) correctTurnsRef.current++
      totalTurnsRef.current++

      const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : undefined

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
    }).catch((err) => { console.error('❌ 피드백 처리 오류:', err); resolveLogId(null) })

    setAIResponding(true)
    setAvatarStatus('processing')

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historyRef.current.slice(-10),
          studentText,
          studentId,
          scenarioId: scenarioRef.current?.id ?? null,
          progressId: progressIdRef.current,
          nickname: studentNickname,
          hintUsed: meta?.hintUsed ?? false,
          progressData: stepProgressRef.current,
          currentBook: currentBookRef.current,
          currentUnit: currentUnitRef.current,
        }),
      })
      if (!res.ok) throw new Error('GPT 응답 실패')
      const data = await res.json()
      const aiText = data.message || data.text || ''
      const translation = data.translation || ''

      // ── 페르소나 업데이트 (학생 발화에서 새 정보 감지 시) ──
      if (data.persona_update && studentId) {
        fetch('/api/persona', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: studentId, persona_update: data.persona_update }),
        }).then(r => r.ok ? r.json() : null).then(d => {
          if (d?.persona) personaRef.current = d.persona
        }).catch(() => {})
      }

      // ── 진도 업데이트 (chat route가 이미 lesson_progress 영속화함) ──
      if (data.progress) {
        const p = data.progress as StepProgress
        stepProgressRef.current = p
        setStepProgress(p)

        setProgress(prev => {
          // 회차의 모든 step 완료 시에는 힌트 사용과 무관하게 100%로 표시
          const merged = p.completed ? 100 : Math.max(prev, p.progress_rate)
          if (reportIdRef.current && merged > prev) {
            fetch('/api/lesson-report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'update', report_id: reportIdRef.current, progress: merged }),
            })
          }
          return merged
        })

        // 회차의 모든 step 완료 → 리포트 마무리 + 완료 선택 카드 트리거 (회차당 1회)
        if (p.completed && !unitCompleteFiredRef.current) {
          unitCompleteFiredRef.current = true
          if (reportIdRef.current) {
            fetch('/api/lesson-report', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'finish',
                report_id: reportIdRef.current,
                conversation_history: historyRef.current.map(m => `${m.role}: ${m.content}`).join('\n'),
                book: currentBookRef.current,
                unit: currentUnitRef.current,
                unit_title: scenarioRef.current?.title || '',
                progress: p.progress_rate,
                corrections: correctionsRef.current.join(', '),
              }),
            })
          }
          onUnitCompleteRef.current?.()
        }
      }

      // chat 응답에서 feedback 처리
      if (data.feedback) {
        const fb = data.feedback
        const feedbackData = {
          grammar: fb.grammar ?? 0,
          overall: fb.overall ?? 0,
          correction: fb.retry_reason ?? null,
        }
        setFeedback(feedbackData)
        updateMessageFeedback(studentMsgId, feedbackData)
        if (fb.grammar) grammarScoresRef.current.push(fb.grammar)
        if (fb.overall) overallScoresRef.current.push(fb.overall)
        if (fb.retry_reason) correctionsRef.current.push(fb.retry_reason)
        if (fb.overall >= 70) correctTurnsRef.current++

        const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : undefined
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
              avg_overall: avg(overallScoresRef.current),
            }),
          })
        }

        // log에 feedback 업데이트
        const logId = await logIdPromise
        if (logId) {
          fetch('/api/log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              log_id: logId,
              ai_text: aiText,
              grammar: fb.grammar,
              overall: fb.overall,
              retry_reason: fb.retry_reason,
            }),
          })
        }
      }

      historyRef.current.push({ role: 'assistant', content: aiText })
      setAIResponding(false)

      // 상황 설명(scene_kr)을 먼저 보여준 뒤 Coty가 말하도록 (새 step 진입 시에만 전달됨)
      const sceneKr: string = data.scene_kr || ''
      const sceneStep: number = data.scene_step || 0
      if (sceneKr) setCurrentScene({ step: sceneStep, text: sceneKr })
      await speak(aiText)

      addMessageRef.current({
        id: (Date.now() + 1).toString(),
        role: 'ai',
        content: aiText,
        translation: translation || undefined,
        hintLine: data.hint_line || undefined,
        acceptVariants: data.accept_variants?.length ? data.accept_variants : undefined,
        sceneKr: sceneKr || undefined,
        sceneStep: sceneKr ? sceneStep : undefined,
        createdAt: new Date().toISOString(),
      })
      setCurrentScene(null)

      // 세션 종료 신호 (클로징 마지막 턴) → 마무리 인사 메시지를 보여주고 TTS까지 마친 뒤 트리거
      // (page.tsx가 이 신호로 마이크 비활성화 + 복습/종료 카드 표시)
      if (data.session_ended === true) setSessionEnded(true)

      // 로그 저장
      const logId = await logIdPromise
      if (logId) {
        fetch('/api/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ log_id: logId, ai_text: aiText }),
        })
      }

    } catch {
      setAIResponding(false)
      setAvatarStatus('idle')
      resolveLogId(null)
    }
  }, [addMessage, setAIResponding, setAvatarStatus, speak, updateMessageFeedback, sessionId, studentId, studentNickname])

  return {
    sendToGPT, isSpeaking, stopSpeaking, feedback,
    clearFeedback: () => setFeedback(null),
    progress, stepProgress, sessionEnded, currentScene,
    start, reset, endSession,
  }
}
