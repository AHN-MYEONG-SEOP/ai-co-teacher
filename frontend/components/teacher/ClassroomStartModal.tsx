'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useCurriculum } from '@/hooks/useCurriculum'

interface ClassroomStartModalProps {
  classId: string
  className: string
  teacherId: string
  onClose: () => void
  onStart: (sessionId: string) => void
}

export function ClassroomStartModal({
  classId,
  className,
  teacherId,
  onClose,
  onStart,
}: ClassroomStartModalProps) {
  const { booksByLevel, level_order, getUnits } = useCurriculum()
  const [selectedBook, setSelectedBook] = useState('')
  const [selectedUnit, setSelectedUnit] = useState(1)
  const [gridCols, setGridCols] = useState(4)
  const [gridRows, setGridRows] = useState(2)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const units = selectedBook ? getUnits(selectedBook) : []

  const handleStart = async () => {
    if (!selectedBook) { setError('교재를 선택해주세요.'); return }
    setLoading(true)
    setError('')
    const supabase = createClient()

    try {
      // 기존 active 세션 종료
      await supabase
        .from('classroom_sessions')
        .update({ status: 'ended', updated_at: new Date().toISOString() })
        .eq('class_id', classId)
        .eq('status', 'active')

      // 새 세션 생성
      const { data, error: insertError } = await supabase
        .from('classroom_sessions')
        .insert({
          class_id: classId,
          teacher_id: teacherId,
          current_step: 1,
          status: 'active',
          coty_message: '',
          coty_scene_kr: '',
          hint_visible: false,
        })
        .select('id')
        .single()

      if (insertError || !data) {
        setError('세션 생성에 실패했습니다.')
        setLoading(false)
        return
      }

      // classes 테이블에 그리드 설정 + 선택한 book/unit 저장
      await supabase
        .from('classes')
        .update({
          grid_cols: gridCols,
          grid_rows: gridRows,
        })
        .eq('id', classId)

      onStart(data.id)
    } catch (e) {
      setError('오류가 발생했습니다.')
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl p-6 space-y-5 mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white font-semibold text-base">🏫 교실 수업 시작</h2>
            <p className="text-xs text-slate-400 mt-0.5">{className}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white">✕</button>
        </div>

        {/* 교재 선택 */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-300">📚 오늘 수업할 교재</p>
          <select
            value={selectedBook}
            onChange={(e) => { setSelectedBook(e.target.value); setSelectedUnit(1) }}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
          >
            <option value="">교재 선택...</option>
            {level_order.map(level => (
              booksByLevel[level] && (
                <optgroup key={level} label={`── ${level} ──`}>
                  {booksByLevel[level].map(book => (
                    <option key={book} value={book}>{book}</option>
                  ))}
                </optgroup>
              )
            ))}
          </select>
        </div>

        {/* Unit 선택 */}
        {selectedBook && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-300">📖 Unit</p>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(Number(e.target.value))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
            >
              {units.map(u => (
                <option key={u.unit} value={u.unit}>
                  Unit {u.unit}{u.title ? ` — ${u.title}` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* 그리드 설정 */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-300">📐 책상 배열</p>
          <div className="flex gap-3 items-center">
            <div className="flex-1">
              <p className="text-xs text-slate-500 mb-1">가로 (열)</p>
              <select
                value={gridCols}
                onChange={(e) => setGridCols(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
              >
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}열</option>)}
              </select>
            </div>
            <span className="text-slate-500 mt-4">×</span>
            <div className="flex-1">
              <p className="text-xs text-slate-500 mb-1">세로 (행)</p>
              <select
                value={gridRows}
                onChange={(e) => setGridRows(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
              >
                {[1,2,3,4].map(n => <option key={n} value={n}>{n}행</option>)}
              </select>
            </div>
          </div>
          {/* 그리드 미리보기 */}
          <div className="mt-2 p-3 bg-slate-800/50 rounded-xl">
            <p className="text-xs text-slate-500 mb-2">미리보기 ({gridCols * gridRows}명)</p>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }}
            >
              {Array.from({ length: gridCols * gridRows }).map((_, i) => (
                <div key={i} className="bg-slate-700 rounded h-6 flex items-center justify-center">
                  <span className="text-[9px] text-slate-400">{i + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        {/* 버튼 */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl py-3 text-sm font-medium transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleStart}
            disabled={loading || !selectedBook}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl py-3 text-sm font-medium transition-colors"
          >
            {loading ? '시작 중...' : '수업 시작 →'}
          </button>
        </div>
      </div>
    </div>
  )
}
