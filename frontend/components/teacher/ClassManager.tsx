'use client'

import { useCallback, useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface StudentLite {
  id: string
  name: string
  nickname: string | null
  class_id: string | null
}
interface ClassWithStudents {
  id: string
  name: string
  teacher_id: string | null
  teacher_name: string | null
  students: StudentLite[]
}
interface TeacherLite {
  id: string
  name: string
}

const INPUT =
  'bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-blue-500'
const SELECT =
  'bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500 disabled:opacity-50'

export default function ClassManager({ teacherId }: { teacherId: string }) {
  const [classes, setClasses] = useState<ClassWithStudents[]>([])
  const [unassigned, setUnassigned] = useState<StudentLite[]>([])
  const [teachers, setTeachers] = useState<TeacherLite[]>([])
  const [newClassName, setNewClassName] = useState('')
  const [newClassTeacher, setNewClassTeacher] = useState(teacherId)
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const fetchAll = useCallback(async () => {
    const [cRes, tRes] = await Promise.all([
      fetch('/api/teacher/classes'),
      fetch('/api/teacher/teachers'),
    ])
    const cData = await cRes.json()
    const tData = await tRes.json()
    if (cRes.ok) {
      setClasses(cData.classes ?? [])
      setUnassigned(cData.unassigned ?? [])
    }
    if (tRes.ok) setTeachers((tData.teachers ?? []).map((t: { id: string; name: string }) => ({ id: t.id, name: t.name })))
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const notify = (text: string, ok: boolean) => setMessage({ text, ok })

  const createClass = async () => {
    if (!newClassName.trim()) return
    if (!newClassTeacher) { notify('❌ 담임 교사를 선택하세요', false); return }
    setBusy(true)
    try {
      const res = await fetch('/api/teacher/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher_id: newClassTeacher, name: newClassName }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setNewClassName('')
      notify('✅ 반을 만들었습니다', true)
      fetchAll()
    } catch (err) {
      notify(`❌ ${err instanceof Error ? err.message : '생성 실패'}`, false)
    } finally { setBusy(false) }
  }

  const renameClass = async () => {
    if (!editing || !editing.name.trim()) return
    setBusy(true)
    try {
      const res = await fetch('/api/teacher/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, name: editing.name }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setEditing(null)
      notify('✅ 이름을 변경했습니다', true)
      fetchAll()
    } catch (err) {
      notify(`❌ ${err instanceof Error ? err.message : '변경 실패'}`, false)
    } finally { setBusy(false) }
  }

  // 담임 교사 변경 (이름은 그대로 두고 teacher_id만 갱신)
  const changeHomeroom = async (c: ClassWithStudents, teacher: string) => {
    setBusy(true)
    try {
      const res = await fetch('/api/teacher/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: c.id, name: c.name, teacher_id: teacher }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      notify('✅ 담임을 변경했습니다', true)
      fetchAll()
    } catch (err) {
      notify(`❌ ${err instanceof Error ? err.message : '변경 실패'}`, false)
    } finally { setBusy(false) }
  }

  const deleteClass = async (id: string, name: string, count: number) => {
    const msg = count > 0
      ? `"${name}" 반을 삭제할까요? 소속 학생 ${count}명은 미배정으로 돌아갑니다.`
      : `"${name}" 반을 삭제할까요?`
    if (!confirm(msg)) return
    setBusy(true)
    try {
      const res = await fetch(`/api/teacher/classes?id=${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      notify('🗑️ 반을 삭제했습니다', true)
      fetchAll()
    } catch (err) {
      notify(`❌ ${err instanceof Error ? err.message : '삭제 실패'}`, false)
    } finally { setBusy(false) }
  }

  const assignStudent = async (studentId: string, classId: string | null) => {
    setBusy(true)
    try {
      const res = await fetch('/api/teacher/assign-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: studentId, class_id: classId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      fetchAll()
    } catch (err) {
      notify(`❌ ${err instanceof Error ? err.message : '배정 실패'}`, false)
    } finally { setBusy(false) }
  }

  // 학생 행 — 반 선택 드롭다운 (미배정 + 전체 반)
  const StudentRow = ({ s }: { s: StudentLite }) => (
    <div className="flex items-center justify-between gap-2 bg-slate-800/40 rounded-lg px-3 py-2">
      <span className="text-sm text-slate-200 truncate">
        {s.name}{s.nickname && s.nickname !== s.name && <span className="text-slate-500 ml-1">({s.nickname})</span>}
      </span>
      <select value={s.class_id ?? ''} disabled={busy} className={cn(SELECT, 'shrink-0')}
        onChange={e => assignStudent(s.id, e.target.value || null)}>
        <option value="">미배정</option>
        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
    </div>
  )

  return (
    <div className="space-y-5">
      {/* 새 반 만들기 */}
      <div className="bg-slate-900/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
        <h3 className="text-white text-sm font-medium">🏫 새 반 만들기</h3>
        <div className="flex gap-2 flex-wrap">
          <input
            className={cn(INPUT, 'flex-1 min-w-[140px]')}
            placeholder="반 이름 (예: 월수금 4시반)"
            value={newClassName}
            onChange={e => setNewClassName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') createClass() }}
          />
          <select value={newClassTeacher} onChange={e => setNewClassTeacher(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500">
            <option value="">담임 선택</option>
            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button onClick={createClass} disabled={busy || !newClassName.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl px-5 py-2 text-sm transition-colors shrink-0">
            반 생성
          </button>
        </div>
        {teachers.length === 0 && (
          <p className="text-xs text-slate-500">등록된 교사가 없습니다. &ldquo;👩‍🏫 교사 관리&rdquo; 탭에서 먼저 교사를 등록하세요.</p>
        )}
      </div>

      {message && (
        <p className={cn('text-xs rounded-lg px-3 py-2', message.ok ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300')}>
          {message.text}
        </p>
      )}

      {/* 반 목록 */}
      <div className="space-y-3">
        <span className="text-sm text-slate-400">📚 반 목록 ({classes.length}개)</span>
        {classes.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-6 text-center">
            <p className="text-slate-500 text-sm">아직 만든 반이 없습니다. 위에서 먼저 반을 만들어 주세요.</p>
          </div>
        ) : classes.map(c => (
          <div key={c.id} className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {editing?.id === c.id ? (
                <div className="flex gap-2 flex-1">
                  <input autoFocus className={cn(INPUT, 'flex-1')} value={editing.name}
                    onChange={e => setEditing({ id: c.id, name: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') renameClass() }} />
                  <button onClick={renameClass} disabled={busy} className="text-xs text-emerald-400 hover:text-emerald-300 px-2">저장</button>
                  <button onClick={() => setEditing(null)} className="text-xs text-slate-500 hover:text-white px-2">취소</button>
                </div>
              ) : (
                <>
                  <div className="min-w-0">
                    <span className="text-sm text-white font-medium">{c.name}</span>
                    <span className="text-xs text-slate-500 ml-2">{c.students.length}명</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-500">담임</span>
                    <select value={c.teacher_id ?? ''} disabled={busy} className={SELECT}
                      onChange={e => changeHomeroom(c, e.target.value)}>
                      <option value="">미지정</option>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button onClick={() => setEditing({ id: c.id, name: c.name })} className="text-xs text-slate-400 hover:text-white">이름변경</button>
                    <button onClick={() => deleteClass(c.id, c.name, c.students.length)} className="text-xs text-red-400/70 hover:text-red-300">삭제</button>
                  </div>
                </>
              )}
            </div>
            {c.students.length === 0 ? (
              <p className="text-xs text-slate-600 pl-1">소속 학생이 없습니다. 아래 &ldquo;미배정 학생&rdquo;에서 배정하세요.</p>
            ) : (
              <div className="space-y-1.5">
                {c.students.map(s => <StudentRow key={s.id} s={s} />)}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 미배정 학생 */}
      <div className="space-y-2">
        <span className="text-sm text-slate-400">🧩 미배정 학생 ({unassigned.length}명)</span>
        {unassigned.length === 0 ? (
          <div className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-6 text-center">
            <p className="text-slate-500 text-sm">미배정 학생이 없습니다.</p>
          </div>
        ) : (
          <div className="bg-slate-900/40 border border-slate-700/30 rounded-2xl p-4 space-y-1.5">
            {unassigned.map(s => <StudentRow key={s.id} s={s} />)}
          </div>
        )}
      </div>
    </div>
  )
}
