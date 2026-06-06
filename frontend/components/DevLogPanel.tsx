'use client'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface LogEntry {
  id: number
  time: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

type TabFilter = '전체' | 'STT' | 'GPT' | 'TTS' | '오류'

const STT_KEYWORDS = ['deepgram', 'stt', 'transcript', '녹음', '인식', 'confidence', 'blob', 'huggingface', 'ipa']
const GPT_KEYWORDS = ['gpt', 'chat', 'prompt', 'token', 'step', 'feedback', 'persona']
const TTS_KEYWORDS = ['tts', 'elevenlabs', 'speak', '재생', 'audio']

function matchesTab(msg: string, tab: TabFilter): boolean {
  const lower = msg.toLowerCase()
  if (tab === '전체') return true
  if (tab === 'STT') return STT_KEYWORDS.some(k => lower.includes(k))
  if (tab === 'GPT') return GPT_KEYWORDS.some(k => lower.includes(k))
  if (tab === 'TTS') return TTS_KEYWORDS.some(k => lower.includes(k))
  if (tab === '오류') return lower.includes('오류') || lower.includes('error') || lower.includes('실패')
  return true
}

export function DevLogPanel({ logs, onClear }: {
  logs: LogEntry[]
  onClear: () => void
}) {
  const [tab, setTab] = useState<TabFilter>('전체')
  const bodyRef = useRef<HTMLDivElement>(null)

  // 새 로그 추가 시 자동 스크롤
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }
  }, [logs])

  const filtered = logs.filter(l => matchesTab(l.message, tab))
  const okCount = logs.filter(l => l.type === 'success').length
  const warnCount = logs.filter(l => l.type === 'warning').length
  const errCount = logs.filter(l => l.type === 'error').length

  // 마지막 응답 시간 (가장 최근 GPT 완료 로그에서 추출)
  const lastLatency = (() => {
    const gptLogs = logs.filter(l => l.message.includes('ms)') || l.message.includes('ms)'))
    const last = gptLogs[gptLogs.length - 1]
    if (!last) return null
    const match = last.message.match(/(\d[\d,]+)ms/)
    return match ? match[1] : null
  })()

  return (
    <div className="flex flex-col h-full bg-[#0a0c10] min-w-0">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#0d1117] border-b border-[#1e2433]">
        <span className="text-[11px] font-semibold text-cyan-400 uppercase tracking-widest">Dev Log</span>
        <span className="text-[10px] bg-[#14532d] text-[#4ade80] px-2 py-0.5 rounded">development</span>
        <button
          onClick={onClear}
          className="ml-auto text-[11px] text-slate-500 hover:text-slate-300 border border-[#1e2433] hover:border-[#334155] px-2.5 py-1 rounded transition-colors"
        >
          clear
        </button>
      </div>

      {/* 탭 */}
      <div className="flex border-b border-[#1e2433] bg-[#0d1117]">
        {(['전체', 'STT', 'GPT', 'TTS', '오류'] as TabFilter[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-1.5 text-[11px] border-b-2 transition-colors',
              tab === t
                ? 'text-cyan-400 border-cyan-400'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 로그 목록 */}
      <div
        ref={bodyRef}
        className="flex-1 overflow-y-auto py-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-[#1e2433]"
      >
        {filtered.length === 0 && (
          <p className="text-[11px] text-slate-600 px-4 py-3">로그가 없습니다.</p>
        )}
        {filtered.map(log => (
          <div
            key={log.id}
            className={cn(
              'px-4 py-1 text-[11.5px] leading-relaxed border-l-2 hover:bg-[#0d1117] transition-colors',
              log.type === 'success' && 'border-[#4ade80]',
              log.type === 'warning' && 'border-[#fbbf24]',
              log.type === 'error'   && 'border-[#f87171]',
              log.type === 'info'    && 'border-[#22d3ee]',
            )}
          >
            <span className="text-[10px] text-slate-600 mr-2 font-mono">{log.time}</span>
            <span className={cn(
              'font-mono',
              log.type === 'success' && 'text-emerald-400',
              log.type === 'warning' && 'text-amber-400',
              log.type === 'error'   && 'text-red-400',
              log.type === 'info'    && 'text-slate-300',
            )}>
              {log.message}
            </span>
          </div>
        ))}
      </div>

      {/* 통계 바 */}
      <div className="flex items-center gap-4 px-4 py-1.5 bg-[#0d1117] border-t border-[#1e2433] text-[10px]">
        <span className="text-slate-500">로그: <span className="text-slate-400">{logs.length}</span></span>
        <span className="text-[#4ade80]">✓ {okCount}</span>
        <span className="text-[#fbbf24]">⚠ {warnCount}</span>
        <span className="text-[#f87171]">✗ {errCount}</span>
        {lastLatency && (
          <span className="ml-auto text-[#4ade80]">마지막: {lastLatency}ms</span>
        )}
      </div>
    </div>
  )
}
