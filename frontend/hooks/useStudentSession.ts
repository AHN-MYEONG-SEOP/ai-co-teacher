'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface StudentSession {
  studentId: string
  sessionId: string | null
}

export function useStudentSession(): StudentSession {
  const supabase = createClient()
  const [sessionId, setSessionId] = useState<string | null>(null)
  const studentIdRef = useRef<string>('')

  useEffect(() => {
    // 브라우저 세션마다 고유 학생 ID 생성 (sessionStorage 사용)
    let sid = sessionStorage.getItem('ai-co-teacher-student-id')
    if (!sid) {
      sid = crypto.randomUUID()
      sessionStorage.setItem('ai-co-teacher-student-id', sid)
    }
    studentIdRef.current = sid

    // Supabase에 세션 생성
    const createSession = async () => {
      try {
        const { data, error } = await supabase
          .from('sessions')
          .insert({
            class_id: null, // Week 5에서 실제 클래스 연동
            started_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (!error && data) {
          setSessionId(data.id)
        }
      } catch {
        // 세션 생성 실패 시 null 유지 (대화는 계속)
      }
    }

    createSession()

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

  return {
    studentId: studentIdRef.current,
    sessionId,
  }
}
