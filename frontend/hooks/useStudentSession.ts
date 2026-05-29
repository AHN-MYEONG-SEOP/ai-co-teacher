'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface StudentSession {
  studentId: string | undefined
  sessionId: string | null
  studentName: string | null
  studentNickname: string | null
  isLoggedIn: boolean
}

export function useStudentSession(): StudentSession {
  const supabase = createClient()
  const router = useRouter()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState<string | null>(null)
  const [studentNickname, setStudentNickname] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      setStudentId(user.id)
      setIsLoggedIn(true)

      // nickname 포함해서 가져오기
      const { data: profile } = await supabase
        .from('profiles')
        .select('name, nickname')
        .eq('id', user.id)
        .single()

      if (profile) {
        setStudentName(profile.name)
        setStudentNickname(profile.nickname || profile.name) // nickname 없으면 name 사용
      }

      try {
        const { data, error } = await supabase
          .from('sessions')
          .insert({
            class_id: null,
            started_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (!error && data) setSessionId(data.id)
      } catch {
        // 세션 생성 실패 무시
      }
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

  return { studentId: studentId ?? undefined, sessionId, studentName, studentNickname, isLoggedIn }
}
