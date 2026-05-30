'use client'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useUIStore } from '@/store/uiStore'

interface NavBarProps {
  logCount?: number
  onLogClick?: () => void
  onSettingsClick?: () => void
}

export function NavBar({ logCount = 0, onLogClick, onSettingsClick }: NavBarProps) {
  const supabase = createClient()
  const router = useRouter()
  const [userName, setUserName] = useState<string | null>(null)
  const [isTeacher, setIsTeacher] = useState(false)
  const { clearMessages } = useUIStore()

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: profile } = await supabase
        .from('profiles').select('name, role').eq('id', user.id).single()
      if (profile) { setUserName(profile.name); setIsTeacher(profile.role === 'teacher') }
    }
    loadUser()
  }, [])

  const handleLogout = async () => {
    // 대화 내용 + 인사말 기록 전부 초기화
    clearMessages()
    sessionStorage.clear()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-slate-900/80 backdrop-blur-md border-b border-slate-700/50">
      <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎙️</span>
          <span className="text-sm font-bold text-white">AI Co-Teacher</span>
        </div>
        <div className="flex items-center gap-3">
          {onLogClick && (
            <button onClick={onLogClick} className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-mono">
              [{logCount} logs]
            </button>
          )}
          {onSettingsClick && (
            <button onClick={onSettingsClick} className="text-xs text-slate-500 hover:text-white transition-colors">
              ⚙️
            </button>
          )}
          {userName && <span className="text-xs text-slate-400">{userName}님</span>}
          {isTeacher && (
            <button onClick={() => router.push('/teacher')}
              className="text-xs bg-blue-600/80 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg transition-colors">
              📊 대시보드
            </button>
          )}
          <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-white transition-colors">
            로그아웃
          </button>
        </div>
      </div>
    </div>
  )
}
