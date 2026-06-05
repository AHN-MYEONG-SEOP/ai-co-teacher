'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export interface PronunciationFeedback {
  student_said: string
  target: string
  is_correct: boolean
  tip_kr: string | null
}
export interface FeedbackData {
  grammar: number
  overall: number
  correction: string | null
  pronunciation?: PronunciationFeedback | null
  fluency?: number
  vocabulary?: number
  tip?: string | null
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className={cn(
          'font-mono font-bold',
          score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-amber-400' : 'text-red-400'
        )}>{score}</span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-700', color)}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  )
}

export function FeedbackCard({ feedback, onClose }: { feedback: FeedbackData; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="w-full bg-slate-900/95 backdrop-blur-md border border-slate-700/50 rounded-2xl animate-in slide-in-from-bottom-4 duration-300 shadow-2xl">

      {/* 헤더 — 항상 표시, 탭으로 접기/펼치기 */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2">
          <span className="text-base">📊</span>
          <span className="text-sm font-medium text-white">발화 피드백</span>
          {/* 점수 3개 미니 표시 (접혔을 때) */}
          {!expanded && (
            <div className="flex items-center gap-1.5 ml-1">
              {[
                { v: feedback.grammar, color: (feedback.grammar ?? 0) >= 80 ? 'text-emerald-400' : (feedback.grammar ?? 0) >= 60 ? 'text-amber-400' : 'text-red-400' },
                { v: feedback.overall, color: (feedback.overall ?? 0) >= 80 ? 'text-emerald-400' : (feedback.overall ?? 0) >= 60 ? 'text-amber-400' : 'text-red-400' },
              ].map((s, i) => (
                <span key={i} className={cn('text-xs font-mono font-bold', s.color)}>{s.v}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-xl font-bold font-mono',
            feedback.overall >= 80 ? 'text-emerald-400' : feedback.overall >= 60 ? 'text-amber-400' : 'text-red-400'
          )}>
            {feedback.overall}
          </span>
          <span className="text-slate-500 text-xs">{expanded ? '▼' : '▲'}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onClose() }}
            className="text-slate-500 hover:text-white text-sm w-6 h-6 flex items-center justify-center"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 상세 내용 — 펼쳤을 때만 표시 */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-700/50 pt-3">
          {/* 점수 바 */}
          <div className="space-y-2">
            <ScoreBar label="문법 (Grammar)" score={feedback.grammar ?? 0} />
            <ScoreBar label="종합 (Overall)" score={feedback.overall ?? 0} />
          </div>

          {/* 교정 */}
          {feedback.correction && (
            <div className="bg-amber-900/30 border border-amber-700/30 rounded-xl p-3">
              <p className="text-xs text-amber-400 mb-1">💡 교정 제안</p>
              <p className="text-sm text-amber-200">{feedback.correction}</p>
            </div>
          )}
          {/* 발음 피드백 */}
          {feedback.pronunciation && !feedback.pronunciation.is_correct && feedback.pronunciation.tip_kr && (
            <div className="bg-violet-900/30 border border-violet-700/30 rounded-xl p-3 space-y-1">
              <p className="text-xs text-violet-400 mb-1">🗣️ 발음 교정</p>
              <p className="text-xs text-slate-400">
                <span className="text-red-400 font-mono">{feedback.pronunciation.student_said}</span>
                {' → '}
                <span className="text-emerald-400 font-mono">{feedback.pronunciation.target}</span>
              </p>
              <p className="text-sm text-violet-200">{feedback.pronunciation.tip_kr}</p>
            </div>
          )}
          {feedback.pronunciation?.is_correct && (
            <div className="bg-emerald-900/20 border border-emerald-700/20 rounded-xl p-3">
              <p className="text-sm text-emerald-300">🗣️ {feedback.pronunciation.tip_kr ?? "발음이 정확해요! 👍"}</p>
            </div>
          )}

          {/* 팁 */}
          <div className="bg-emerald-900/20 border border-emerald-700/20 rounded-xl p-3">
            <p className="text-xs text-emerald-400 mb-1">✨ Tip</p>
            <p className="text-sm text-emerald-200">{feedback.tip}</p>
          </div>
        </div>
      )}
    </div>
  )
}
