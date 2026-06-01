'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { LessonScenario } from './useConversation'

export interface StudentSettings {
  tts_speed: 'slow' | 'normal' | 'fast'
  show_feedback: boolean
  current_book: string
  current_unit: number
}

const DEFAULT_SETTINGS: StudentSettings = {
  tts_speed: 'normal',
  show_feedback: true,
  current_book: 'STARLAND Phonics 1 Single Letters',
  current_unit: 1,
}

interface StudentSession {
  studentId: string | undefined
  sessionId: string | null
  studentName: string | null
  studentNickname: string | null
  isLoggedIn: boolean
  settings: StudentSettings
  persona: Record<string, unknown> | null
  scenario: LessonScenario | null
  updateSettings: (settings: Partial<StudentSettings>) => Promise<void>
}

export function useStudentSession(): StudentSession {
  const supabase = createClient()
  const router = useRouter()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState<string | null>(null)
  const [studentNickname, setStudentNickname] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [settings, setSettings] = useState<StudentSettings>(DEFAULT_SETTINGS)
  const [persona, setPersona] = useState<Record<string, unknown> | null>(null)
  const [scenario, setScenario] = useState<LessonScenario | null>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setStudentId(user.id)
      setIsLoggedIn(true)

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, nickname, tts_speed, show_feedback, current_book, current_unit')
        .eq('id', user.id)
        .single()

      const book = profile?.current_book || DEFAULT_SETTINGS.current_book
      const unit = profile?.current_unit || DEFAULT_SETTINGS.current_unit

      if (profile) {
        setStudentName(profile.name)
        setStudentNickname(profile.nickname || profile.name)
        setSettings({
          tts_speed: profile.tts_speed || 'normal',
          show_feedback: profile.show_feedback ?? true,
          current_book: book,
          current_unit: unit,
        })
      }

      // ① 페르소나 로드
      fetch(`/api/persona?student_id=${user.id}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.persona) setPersona(d.persona) })
        .catch(() => {})

      // ② 오늘 수업 시나리오 생성 (백그라운드 — 수업 시작 전 준비)
      fetch('/api/lesson-scenario?action=generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: user.id, book, unit }),
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.scenario) setScenario(d.scenario) })
        .catch(() => {})

      try {
        const { data, error } = await supabase
          .from('sessions')
          .insert({ class_id: null, started_at: new Date().toISOString() })
          .select('id')
          .single()
        if (!error && data) setSessionId(data.id)
      } catch { }
    }

    init()

    const handleUnload = async () => {
      if (sessionId) {
        await supabase
          .from('sessions')
          .update({ ended_at: new Date().toISOString() })
          .eq('id', sessionId)
      }
    }
    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [])

  // 설정 업데이트 — Supabase에 저장
  const updateSettings = async (newSettings: Partial<StudentSettings>) => {
    if (!studentId) return
    const updated = { ...settings, ...newSettings }
    setSettings(updated)
    await supabase
      .from('profiles')
      .update({
        tts_speed: updated.tts_speed,
        show_feedback: updated.show_feedback,
        current_book: updated.current_book,
        current_unit: updated.current_unit,
      })
      .eq('id', studentId)
  }

  return { studentId: studentId ?? undefined, sessionId, studentName, studentNickname, isLoggedIn, settings, persona, scenario, updateSettings }
}
