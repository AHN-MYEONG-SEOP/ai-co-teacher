'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function StudentHomePage() {
  const [profile, setProfile] = useState<{name:string, nickname:string} | null>(null)
  const [activeSession, setActiveSession] = useState<{id:string, session_key:string} | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: prof } = await supabase
        .from('profiles')
        .select('name, nickname')
        .eq('id', user.id)
        .single()
      setProfile(prof)

      // 진행중인 Assessment 세션 확인
      const { data: sessions } = await supabase
        .from('asm_sessions')
        .select('id, session_key')
        .in('status', ['ready', 'active'])
        .order('created_at', { ascending: false })
        .limit(1)
      if (sessions?.length) setActiveSession(sessions[0])
    }
    load()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const menus = [
    {
      icon: '📝',
      title: 'Speaking Assessment',
      desc: '말하기 평가 투표 참여',
      color: 'border-yellow-500/50 bg-yellow-500/10',
      iconBg: 'bg-yellow-500/20',
      badge: activeSession ? '🟢 진행중' : null,
      onClick: () => activeSession
        ? router.push('/assessment/vote?session_id=' + activeSession.id)
        : alert('현재 진행중인 Assessment가 없습니다.'),
    },
    {
      icon: '📚',
      title: '자습하기',
      desc: 'AI Coty와 함께 영어 연습',
      color: 'border-emerald-500/50 bg-emerald-500/10',
      iconBg: 'bg-emerald-500/20',
      badge: null,
      onClick: () => router.push('/'),
    },
    {
      icon: '🏫',
      title: '수업 참가',
      desc: '선생님 수업 화면으로 이동',
      color: 'border-blue-500/50 bg-blue-500/10',
      iconBg: 'bg-blue-500/20',
      badge: null,
      onClick: () => router.push('/student/classroom'),
    },
    {
      icon: '📊',
      title: '내 학습 기록',
      desc: '지금까지 학습한 내용 보기',
      color: 'border-purple-500/50 bg-purple-500/10',
      iconBg: 'bg-purple-500/20',
      badge: null,
      onClick: () => alert('준비 중입니다.'),
    },
  ]

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* 헤더 */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-slate-400 text-xs">안녕하세요!</p>
          <p className="text-white font-bold text-lg">{profile?.nickname || profile?.name || '...'} 👋</p>
        </div>
        <button
          onClick={handleLogout}
          className="text-slate-400 hover:text-white text-sm transition-colors"
        >
          로그아웃
        </button>
      </div>

      {/* 메뉴 */}
      <div className="flex-1 p-6 space-y-4 max-w-lg mx-auto w-full">
        {menus.map((menu, i) => (
          <button
            key={i}
            onClick={menu.onClick}
            className={`w-full border rounded-2xl p-5 text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${menu.color}`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl ${menu.iconBg}`}>
                {menu.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-white font-bold text-lg">{menu.title}</p>
                  {menu.badge && (
                    <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
                      {menu.badge}
                    </span>
                  )}
                </div>
                <p className="text-slate-400 text-sm mt-0.5">{menu.desc}</p>
              </div>
              <span className="text-slate-600 text-xl">›</span>
            </div>
          </button>
        ))}
      </div>

      {/* 버전 */}
      <div className="text-center pb-4">
        <p className="text-slate-700 text-xs">Samyook English Lab</p>
      </div>
    </div>
  )
}
