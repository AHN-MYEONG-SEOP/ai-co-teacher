'use client'

import { cn } from '@/lib/utils'

export interface FeedbackData {
  grammar: number
  fluency: number
  vocabulary: number
  overall: number
  correction: string | null
  tip: string
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
  return (
    <div className="w-full bg-slate-900/90 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-4 space-y-3 animate-in slide-in-from-bottom-4 duration-300">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <span className="text-sm font-medium text-white">발화 피드백</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-2xl font-bold font-mono',
            feedback.overall >= 80 ? 'text-emerald-400' : feedback.overall >= 60 ? 'text-amber-400' : 'text-red-400'
          )}>
            {feedback.overall}
          </span>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-sm">✕</button>
        </div>
      </div>

      {/* 점수 바 */}
      <div className="space-y-2">
        <ScoreBar label="문법 (Grammar)" score={feedback.grammar} />
        <ScoreBar label="유창성 (Fluency)" score={feedback.fluency} />
        <ScoreBar label="어휘 (Vocabulary)" score={feedback.vocabulary} />
      </div>

      {/* 교정 */}
      {feedback.correction && (
        <div className="bg-amber-900/30 border border-amber-700/30 rounded-xl p-3">
          <p className="text-xs text-amber-400 mb-1">💡 교정 제안</p>
          <p className="text-sm text-amber-200">{feedback.correction}</p>
        </div>
      )}

      {/* 팁 */}
      <div className="bg-emerald-900/20 border border-emerald-700/20 rounded-xl p-3">
        <p className="text-xs text-emerald-400 mb-1">✨ Tip</p>
        <p className="text-sm text-emerald-200">{feedback.tip}</p>
      </div>
    </div>
  )
}
