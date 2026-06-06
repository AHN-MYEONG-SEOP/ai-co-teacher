'use client'

import { cn } from '@/lib/utils'
import type { ConversationMessage, WordResult } from '@/types'

export interface LessonCellProps {
  // 학생 정보
  studentId: string
  studentName: string

  // 수업 상태
  isActive: boolean          // 내 차례인지 (개별질문 시)
  isMyCell: boolean          // 내 칸인지

  // 대화 내용
  messages: ConversationMessage[]
  currentScene: { text: string; step: number } | null
  interimText: string
  isSpeaking: boolean
  isHolding: boolean
  avatarStatus: string

  // 이미지
  stepImageUrl?: string

  // 마이크 제어
  onMicStart: () => void
  onMicStop: () => void
  isSupported: boolean
  sessionEnded: boolean

  // 그리드 크기 (셀 크기 조정용)
  gridCols: number
}

export function LessonCell({
  studentName,
  isActive,
  isMyCell,
  messages,
  currentScene,
  interimText,
  isSpeaking,
  isHolding,
  avatarStatus,
  stepImageUrl,
  onMicStart,
  onMicStop,
  isSupported,
  sessionEnded,
  gridCols,
}: LessonCellProps) {

  // 마지막 학생/AI 메시지
  const lastStudentMsg = [...messages].reverse().find(m => m.role === 'student')
  const lastAiMsg = [...messages].reverse().find(m => m.role === 'ai')

  // 셀 상태
  const cellStatus = (() => {
    if (isHolding) return 'listening'
    if (isSpeaking) return 'speaking'
    if (avatarStatus === 'processing') return 'processing'
    if (lastStudentMsg?.feedback?.overall !== undefined && lastStudentMsg.feedback.overall >= 80) return 'correct'
    if (lastStudentMsg?.feedback?.overall !== undefined && lastStudentMsg.feedback.overall < 70) return 'incorrect'
    return 'idle'
  })()

  const statusConfig = {
    idle:       { color: 'border-slate-700',    dot: 'bg-slate-500',   label: '대기 중' },
    listening:  { color: 'border-emerald-500',  dot: 'bg-emerald-400', label: '듣는 중...' },
    speaking:   { color: 'border-violet-500',   dot: 'bg-violet-400',  label: '말하는 중...' },
    processing: { color: 'border-amber-500',    dot: 'bg-amber-400',   label: '분석 중...' },
    correct:    { color: 'border-emerald-400',  dot: 'bg-emerald-400', label: '정답! ✅' },
    incorrect:  { color: 'border-red-500',      dot: 'bg-red-400',     label: '다시 해봐요' },
  }

  const status = statusConfig[cellStatus]

  return (
    <div className={cn(
      'relative flex flex-col bg-slate-900 rounded-2xl border-2 overflow-hidden transition-all duration-300',
      status.color,
      isMyCell ? 'ring-2 ring-offset-1 ring-offset-slate-950' : '',
      isActive ? 'ring-emerald-400' : 'ring-transparent',
      !isActive && !isMyCell ? 'opacity-75' : ''
    )}>

      {/* 헤더: 학생 이름 + 상태 */}
      <div className="flex items-center justify-between px-3 py-2 bg-slate-800/80 border-b border-slate-700/50">
        <div className="flex items-center gap-2">
          <div className={cn('w-2 h-2 rounded-full', status.dot,
            cellStatus === 'listening' || cellStatus === 'speaking' ? 'animate-pulse' : ''
          )} />
          <span className="text-xs font-medium text-slate-200">{studentName}</span>
        </div>
        <span className="text-[10px] text-slate-500">{status.label}</span>
      </div>

      {/* 상황 이미지 (있을 때만) */}
      {stepImageUrl && (
        <div className="px-3 pt-2">
          <img
            src={stepImageUrl}
            alt="상황 이미지"
            className="w-full rounded-xl object-cover"
            style={{ maxHeight: gridCols <= 2 ? '160px' : '80px' }}
          />
        </div>
      )}

      {/* Coty 질문 텍스트 */}
      {lastAiMsg && (
        <div className="px-3 pt-2">
          <p className={cn(
            'text-violet-300 leading-relaxed',
            gridCols <= 1 ? 'text-sm' : gridCols <= 2 ? 'text-xs' : 'text-[11px]'
          )}>
            {lastAiMsg.content}
          </p>
          {lastAiMsg.sceneKr && (
            <p className="text-[10px] text-amber-300/70 mt-1">{lastAiMsg.sceneKr}</p>
          )}
        </div>
      )}

      {/* 학생 답변 */}
      {lastStudentMsg && (
        <div className="px-3 pt-2">
          <div className={cn(
            'rounded-xl px-3 py-2 bg-slate-800/60 border',
            lastStudentMsg.feedback?.overall !== undefined && lastStudentMsg.feedback.overall >= 80
              ? 'border-emerald-700/40'
              : 'border-red-700/40'
          )}>
            <p className={cn(
              'text-emerald-200',
              gridCols <= 1 ? 'text-sm' : 'text-xs'
            )}>
              "{lastStudentMsg.content}"
            </p>
            {lastStudentMsg.feedback?.overall !== undefined && (
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-slate-400">
                  {lastStudentMsg.feedback.overall >= 80 ? '✅' : '❌'}
                  {lastStudentMsg.feedback.overall}점
                </span>
                {lastStudentMsg.feedback?.grammar !== undefined && (
                  <span className="text-[10px] text-slate-500">
                    문법 {lastStudentMsg.feedback.grammar}점
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 실시간 자막 */}
      {(isHolding || interimText) && isMyCell && (
        <div className="px-3 pt-2">
          <p className="text-xs text-amber-300 animate-pulse">
            {interimText || '🎤 말하는 중...'}
          </p>
        </div>
      )}

      {/* 마이크 버튼 (내 칸이고 활성화된 경우만) */}
      {isMyCell && (
        <div className="flex items-center justify-center p-3 mt-auto">
          <button
            onMouseDown={(e) => { e.preventDefault(); onMicStart() }}
            onMouseUp={(e) => { e.preventDefault(); onMicStop() }}
            onMouseLeave={() => { if (isHolding) onMicStop() }}
            onTouchStart={(e) => { e.preventDefault(); onMicStart() }}
            onTouchEnd={(e) => { e.preventDefault(); onMicStop() }}
            onContextMenu={(e) => e.preventDefault()}
            disabled={!isSupported || sessionEnded || !isActive}
            className={cn(
              'rounded-full flex items-center justify-center transition-all duration-150 shadow-xl select-none',
              gridCols <= 1 ? 'w-20 h-20 text-3xl' : 'w-12 h-12 text-xl',
              'disabled:opacity-40 disabled:cursor-not-allowed',
              isHolding
                ? 'bg-gradient-to-br from-blue-400 to-blue-600 scale-110 ring-4 ring-blue-400/40'
                : 'bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600'
            )}
          >
            {sessionEnded ? '👋' : isHolding ? '🎙️' : '🎤'}
          </button>
        </div>
      )}

      {/* 내 칸 아닐 때 — 다른 학생 답변 보기만 */}
      {!isMyCell && !lastStudentMsg && (
        <div className="flex items-center justify-center flex-1 py-4">
          <p className="text-[10px] text-slate-600">대기 중...</p>
        </div>
      )}

    </div>
  )
}
