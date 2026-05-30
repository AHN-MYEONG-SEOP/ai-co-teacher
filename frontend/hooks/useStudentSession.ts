'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export interface StudentSettings {
  tts_speed: 'slow' | 'normal' | 'fast'
  show_feedback: boolean
  show_translation: boolean
  current_book: string
  current_unit: number
}

const DEFAULT_SETTINGS: StudentSettings = {
  tts_speed: 'normal',
  show_feedback: true,
  show_translation: false,
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
        .select('name, nickname, tts_speed, show_feedback, show_translation, current_book, current_unit')
        .eq('id', user.id)
        .single()

      if (profile) {
        setStudentName(profile.name)
        setStudentNickname(profile.nickname || profile.name)
        setSettings({
          tts_speed: profile.tts_speed || 'normal',
          show_feedback: profile.show_feedback ?? true,
          show_translation: profile.show_translation ?? false,
          current_book: profile.current_book || 'STARLAND Phonics 1 Single Letters',
          current_unit: profile.current_unit || 1,
        })
      }

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
        show_translation: updated.show_translation,
        current_book: updated.current_book,
        current_unit: updated.current_unit,
      })
      .eq('id', studentId)
  }

  return { studentId: studentId ?? undefined, sessionId, studentName, studentNickname, isLoggedIn, settings, updateSettings }
}
