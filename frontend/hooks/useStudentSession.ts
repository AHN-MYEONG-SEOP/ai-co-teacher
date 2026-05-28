'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface StudentSession {
  studentId: string | undefined
  sessionId: string | null
  studentName: string | null
  isLoggedIn: boolean
}

export function useStudentSession(): StudentSession {
  const supabase = createClient()
  const router = useRouter()
  const [studentId, setStudentId] = useState<string | null>(null)
  const [studentName, setStudentName] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)

  useEffect(() => {
    const init = async () => {
      // 로그인 상태 확인
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        // 로그인 안 되어 있으면 로그인 페이지로
        router.push('/student-login')
        return
      }

      setStudentId(user.id)
      setIsLoggedIn(true)

      // 프로필에서 이름 가져오기
      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single()

      if (profile) setStudentName(profile.name)

      // 세션 생성
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

    // 페이지 언로드 시 세션 종료
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

  return { studentId: studentId ?? undefined, sessionId, studentName, isLoggedIn }
}
