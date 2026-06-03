'use client'

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface TeacherRow {
  id: string
  name: string
  nickname: string | null
  class_count: number
}
interface NewTeacher {
  name: string
  nickname: string
  email: string
  password: string
}

const INPUT =
  'bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-blue-500'

export default function TeacherManager({ currentTeacherId }: { currentTeacherId: string }) {
  const [teachers, setTeachers] = useState<TeacherRow[]>([])
  const [form, setForm] = useState<NewTeacher>({ name: '', nickname: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const fetchTeachers = useCallback(async () => {
    const res = await fetch('/api/teacher/teachers')
    const data = await res.json()
    if (res.ok) setTeachers(data.teachers ?? [])
  }, [])

  useEffect(() => { fetchTeachers() }, [fetchTeachers])

  const createTeacher = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch('/api/teacher/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage({ text: `✅ ${form.name} 교사 계정 생성 완료!`, ok: true })
      setForm({ name: '', nickname: '', email: '', password: '' })
      fetchTeachers()
    } catch (err) {
      setMessage({ text: `❌ ${err instanceof Error ? err.message : '생성 실패'}`, ok: false })
    } finally { setBusy(false) }
  }

  const deleteTeacher = async (t: TeacherRow) => {
    if (!confirm(`"${t.name}" 교사 계정을 삭제할까요? 되돌릴 수 없습니다.`)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/teacher/teachers?id=${t.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setMessage({ text: '🗑️ 교사 계정을 삭제했습니다', ok: true })
      fetchTeachers()
    } catch (err) {
      setMessage({ text: `❌ ${err instanceof Error ? err.message : '삭제 실패'}`, ok: false })
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      {/* 교사 등록 */}
      <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-6 space-y-4">
        <h3 className="text-white font-medium">👩‍🏫 새 교사 계정 등록</h3>
        <div className="grid grid-cols-2 gap-3">
          <input className={INPUT} placeholder="교사 이름 (예: 김선생)" value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
          <input className={INPUT} placeholder="호칭 (선택) — 비워두면 이름 사용" value={form.nickname}
            onChange={e => setForm(p => ({ ...p, nickname: e.target.value }))} />
          <input type="email" className={INPUT} placeholder="이메일" value={form.email}
            onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          <input type="password" className={INPUT} placeholder="비밀번호" value={form.password}
            onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
        </div>
        <button onClick={createTeacher}
          disabled={busy || !form.name || !form.email || !form.password}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl px-6 py-2 text-sm transition-colors">
          {busy ? '처리 중...' : '교사 등록'}
        </button>
        {message && (
          <p className={cn('text-xs rounded-lg px-3 py-2', message.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300')}>
            {message.text}
          </p>
        )}
      </div>

      {/* 교사 목록 */}
      <div className="space-y-2">
        <span className="text-sm text-slate-400">👥 교사 목록 ({teachers.length}명)</span>
        {teachers.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-6 text-center">
            <p className="text-slate-500 text-sm">등록된 교사가 없습니다.</p>
          </div>
        ) : teachers.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-2 bg-slate-900/40 border border-slate-700/30 rounded-2xl px-4 py-3">
            <div className="min-w-0">
              <span className="text-sm text-white font-medium">{t.name}</span>
              {t.nickname && t.nickname !== t.name && <span className="text-xs text-slate-500 ml-2">({t.nickname})</span>}
              <span className="text-xs text-slate-500 ml-2">담임 {t.class_count}반</span>
              {t.id === currentTeacherId && <span className="text-xs text-blue-400 ml-2">나</span>}
            </div>
            {t.id !== currentTeacherId && (
              <button onClick={() => deleteTeacher(t)} disabled={busy}
                className="text-xs text-red-400/70 hover:text-red-300 shrink-0 disabled:opacity-40">삭제</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
