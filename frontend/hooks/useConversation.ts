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

// 진도 추적 — lesson_scenarios.progress_state 와 동일 구조
export interface ProgressStage {
  type: string
  target: string
  pattern_core?: string
  valid_variations?: string[]
  weight: number
  min_uses: number
  current_count: number
  completed: boolean
  usage_log: string[]
}
export interface ProgressState {
  progress: number
  stages: ProgressStage[]
}
export interface LessonScenario {
  id: string
  book: string
  unit: number
  unit_title?: string | null
  scenario: Record<string, unknown>
  progress_state: ProgressState
  status: string
}
interface StageProgressItem {
  target?: string
  used_form?: string
  natural_use?: boolean
  hint_used?: boolean
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
  onBookUnitChange?: (book: string, unit: number) => void
}

// stage_progress 항목을 progress_state의 stage에 매칭
function matchStage(stages: ProgressStage[], item: StageProgressItem): ProgressStage | undefined {
  const t = (item.target || '').toLowerCase().trim()
  const used = (item.used_form || '').toLowerCase().trim()
  if (!t && !used) return undefined
  return stages.find((s) => {
    const st = (s.target || '').toLowerCase().trim()
    if (!st) return false
    if (st === t || (t && (st.includes(t) || t.includes(st)))) return true
    if (s.pattern_core && t.includes(s.pattern_core.toLowerCase())) return true
    if (s.valid_variations?.some((v) => {
      const vv = v.toLowerCase()
      return (used && (used.includes(vv) || vv.includes(used))) || (t && (t.includes(vv) || vv.includes(t)))
    })) return true
    return false
  })
}

// 완료된 stage 가중치 합 → 0~100 진도율 (가중치 합이 100이 아니어도 정규화)
function computeProgress(stages: ProgressStage[]): number {
  const total = stages.reduce((a, s) => a + (s.weight || 0), 0)
  const done = stages.filter((s) => s.completed).reduce((a, s) => a + (s.weight || 0), 0)
  if (total <= 0) {
    if (stages.length === 0) return 0
    const completed = stages.filter((s) => s.completed).length
    return Math.round((completed / stages.length) * 100)
  }
  return Math.min(100, Math.round((done / total) * 100))
}

// 대화 단계
type LessonPhase = 'greeting' | 'weather' | 'review' | 'confirm_unit' | 'study'

const TTS_SPEED_MAP = { slow: 0.75, normal: 1.0, fast: 1.25 }

export function useConversation({
  sessionId, studentId, studentNickname,
  ttsSpeed = 'normal',
  currentBook, currentUnit,
  persona, scenario,
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

  // 페르소나 + 시나리오/진도 상태
  const personaRef = useRef<Record<string, unknown> | null>(persona ?? null)
  const scenarioRef = useRef<LessonScenario | null>(scenario ?? null)
  const progressStateRef = useRef<ProgressState | null>(scenario?.progress_state ?? null)
  const [progressState, setProgressState] = useState<ProgressState | null>(scenario?.progress_state ?? null)

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
  useEffect(() => { personaRef.current = persona ?? null }, [persona])
  // 시나리오 도착 시 진도 상태 초기화 (수업 시작 전 백그라운드 생성)
  useEffect(() => {
    if (!scenario) return
    scenarioRef.current = scenario
    if (scenario.progress_state && !progressStateRef.current) {
      progressStateRef.current = scenario.progress_state
      setProgressState(scenario.progress_state)
      setProgress(scenario.progress_state.progress || 0)
    }
  }, [scenario])

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
  }, [])

  // 로그 저장
  const saveLog = useCallback(async (role: 'student' | 'ai', content: string, extra?: Record<string, unknown>) => {
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
        if (!res.ok) {
          console.error(`❌ 피드백 요청 실패: ${res.status}`)
          resolveLogId(null)
          return
        }
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
      }).catch((err) => { console.error('❌ 피드백 처리 오류:', err); resolveLogId(null) })
    } else {
      resolveLogId(null)
    }

    setAIResponding(true)
    setAvatarStatus('processing')

    try {
      // 아직 완료되지 않은 target 목록 — GPT가 학생을 유도하도록 힌트
      const pendingTargets = (progressStateRef.current?.stages || [])
        .filter(s => !s.completed)
        .map(s => s.target)

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
          persona: personaRef.current,
          scenario: scenarioRef.current,
          pendingTargets,
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

      // ── 진도율 업데이트 (자연스럽게 3회 사용 = 완료) ──
      if (Array.isArray(data.stage_progress) && data.stage_progress.length > 0 && progressStateRef.current) {
        const ps = progressStateRef.current
        let changed = false
        for (const item of data.stage_progress as StageProgressItem[]) {
          if (!item.natural_use) continue
          if (item.hint_used || meta?.hintUsed) continue  // 힌트 보고 말한 건 카운트 안 함
          const stage = matchStage(ps.stages, item)
          if (!stage || stage.completed) continue
          stage.current_count++
          if (item.used_form) stage.usage_log.push(item.used_form)
          if (stage.current_count >= stage.min_uses) stage.completed = true
          changed = true
        }
        if (changed) {
          const newProgress = computeProgress(ps.stages)
          ps.progress = newProgress
          const nextState: ProgressState = { progress: newProgress, stages: ps.stages.map(s => ({ ...s })) }
          progressStateRef.current = nextState
          setProgressState(nextState)

          setProgress(prev => {
            const merged = Math.max(prev, newProgress)
            // 시나리오 진도 저장
            if (scenarioRef.current?.id) {
              fetch('/api/lesson-scenario?action=update_progress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  scenario_id: scenarioRef.current.id,
                  progress_state: nextState,
                  status: merged >= 100 ? 'used' : undefined,
                }),
              }).catch(() => {})
            }
            // report에 progress 저장
            if (reportIdRef.current && merged > prev) {
              fetch('/api/lesson-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'update', report_id: reportIdRef.current, progress: merged }),
              })
            }
            // 100% 달성 시 최종 요약 생성
            if (merged >= 100 && prev < 100 && reportIdRef.current) {
              fetch('/api/lesson-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'finish',
                  report_id: reportIdRef.current,
                  conversation_history: historyRef.current.map(m => `${m.role}: ${m.content}`).join('\n'),
                  book: currentBookRef.current,
                  unit: currentUnitRef.current,
                  unit_title: scenarioRef.current?.unit_title || '',
                  progress: merged,
                  corrections: correctionsRef.current.join(', '),
                }),
              })
            }
            return merged
          })
        }
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
    progressState,
  }
}
