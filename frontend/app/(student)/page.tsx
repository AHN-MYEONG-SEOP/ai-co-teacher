'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useWebSpeech } from '@/hooks/useWebSpeech'
import { useMediaRecorder } from '@/hooks/useMediaRecorder'
import { useConversation, type LessonScenario, type StepProgress } from '@/hooks/useConversation'
import { useStudentSession, type StudentSettings } from '@/hooks/useStudentSession'
import { useCurriculum } from '@/hooks/useCurriculum'
import { NavBar } from '@/components/common/NavBar'
import { useAudioStore } from '@/store/audioStore'
import { useUIStore } from '@/store/uiStore'
import { useAudioConfigStore, type AudioProcessingConfig } from '@/store/audioConfigStore'
import { cn } from '@/lib/utils'
import type { WordResult } from '@/types'

// ── 설정 모달 ──────────────────────────────────────────
function SettingsModal({
  settings,
  onUpdate,
  onClose,
}: {
  settings: StudentSettings
  onUpdate: (s: Partial<StudentSettings>) => Promise<void>
  onClose: () => void
}) {
  const [local, setLocal] = useState(settings)
  const [saving, setSaving] = useState(false)
  const { booksByLevel, level_order, getUnits } = useCurriculum()

  const handleSave = async () => {
    setSaving(true)
    await onUpdate(local)
    setSaving(false)
    onClose()
  }

  const units = getUnits(local.current_book)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-t-3xl p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-300 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">⚙️ 설정</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-sm">✕</button>
        </div>

        {/* 📚 학습 교재 선택 */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-300">📚 학습 교재</p>

          {/* Book 선택 */}
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Book</p>
            <select
              value={local.current_book}
              onChange={(e) => setLocal(p => ({
                ...p,
                current_book: e.target.value,
                current_unit: 1,  // book 바뀌면 unit 1로 초기화
              }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
            >
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
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Unit</p>
            <select
              value={local.current_unit}
              onChange={(e) => setLocal(p => ({ ...p, current_unit: Number(e.target.value) }))}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
            >
              {units.map(u => (
                <option key={u.unit} value={u.unit}>
                  Unit {u.unit}{u.title ? ` — ${u.title}` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 선택된 Unit 미리보기 */}
          {units.find(u => u.unit === local.current_unit) && (
            <div className="bg-slate-800/60 rounded-xl px-3 py-2 space-y-1">
              <p className="text-xs text-emerald-400">학습 단어</p>
              <p className="text-xs text-slate-300 leading-relaxed">
                {units.find(u => u.unit === local.current_unit)?.words.split(',').slice(0, 8).join(', ')}...
              </p>
            </div>
          )}
        </div>
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-300">🔊 AI 말하기 속도</p>
          <div className="space-y-2">
            {([
              { value: 'slow',   label: '느림',  desc: '천천히 또렷하게' },
              { value: 'normal', label: '보통',  desc: '일반적인 속도' },
              { value: 'fast',   label: '빠름',  desc: '원어민 속도에 가깝게' },
            ] as const).map((opt) => (
              <label key={opt.value} className="flex items-center gap-3 cursor-pointer group">
                <div className={cn(
                  'w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors',
                  local.tts_speed === opt.value
                    ? 'border-emerald-400 bg-emerald-400'
                    : 'border-slate-600 group-hover:border-slate-400'
                )}>
                  {local.tts_speed === opt.value && (
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />
                  )}
                </div>
                <input
                  type="radio"
                  className="sr-only"
                  checked={local.tts_speed === opt.value}
                  onChange={() => setLocal(p => ({ ...p, tts_speed: opt.value }))}
                />
                <div>
                  <span className="text-sm text-white">{opt.label}</span>
                  <span className="text-xs text-slate-500 ml-2">{opt.desc}</span>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* 발화 피드백 표시 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-300">📝 발화 피드백 표시</p>
            <p className="text-xs text-slate-500 mt-0.5">말한 후 문법/유창성 점수 표시</p>
          </div>
          <button
            onClick={() => setLocal(p => ({ ...p, show_feedback: !p.show_feedback }))}
            className={cn(
              'w-12 h-6 rounded-full transition-colors relative',
              local.show_feedback ? 'bg-emerald-500' : 'bg-slate-600'
            )}
          >
            <div className={cn(
              'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform',
              local.show_feedback ? 'translate-x-6' : 'translate-x-0.5'
            )} />
          </button>
        </div>

        {/* 저장 버튼 */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-2xl py-3 text-sm font-medium transition-colors"
        >
          {saving ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  )
}

// ── 녹음 재생 버튼 (원본 / 가공본 공용) ──────────────
function PlaybackButton({
  url,
  label,
  accent = 'bg-emerald-600 hover:bg-emerald-700',
}: {
  url: string | null
  label: string
  accent?: string
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  // 언마운트(새 녹음 → key로 리마운트) 시 재생 중이던 오디오 정지
  useEffect(() => () => { audioRef.current?.pause() }, [])

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        onClick={async () => {
          if (!url) return
          if (playing && audioRef.current) {
            audioRef.current.pause()
            audioRef.current.currentTime = 0
            setPlaying(false)
            return
          }
          try {
            const audio = new Audio(url)
            audioRef.current = audio
            audio.onended = () => setPlaying(false)
            audio.onerror = () => setPlaying(false)
            setPlaying(true)
            await audio.play()
          } catch (e) {
            console.error('재생 실패:', e)
            setPlaying(false)
          }
        }}
        disabled={!url}
        className={cn(
          'w-14 h-14 rounded-full flex items-center justify-center text-xl',
          'transition-all duration-200 shadow-lg select-none',
          url
            ? playing
              ? `${accent} text-white`
              : 'bg-slate-700 hover:bg-slate-600 text-white'
            : 'bg-slate-800 text-slate-600 cursor-not-allowed'
        )}
        title={`${label} 재생`}
      >
        {playing ? '⏹️' : '▶️'}
      </button>
      <span className={cn('text-[10px]', url ? 'text-slate-400' : 'text-slate-600')}>{label}</span>
    </div>
  )
}

// 가공 설정 모달용 토글/슬라이더 (모듈 레벨 — 렌더 중 컴포넌트 생성 방지)
function ConfigToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn('w-11 h-6 rounded-full transition-colors relative shrink-0', on ? 'bg-emerald-500' : 'bg-slate-600')}
    >
      <div className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform', on ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  )
}

function ConfigSlider({ label, value, min, max, step, unit, onChange, disabled }: {
  label: string; value: number; min: number; max: number; step: number; unit: string
  onChange: (v: number) => void; disabled?: boolean
}) {
  return (
    <div className={cn('space-y-1', disabled && 'opacity-40 pointer-events-none')}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="text-xs text-emerald-400 font-mono">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-emerald-500"
      />
    </div>
  )
}

// ── 🎛️ 오디오 가공 설정 모달 ──────────────────────────
function AudioProcessingModal({
  config,
  onApply,
  onReset,
  onClose,
}: {
  config: AudioProcessingConfig
  onApply: (c: AudioProcessingConfig) => void
  onReset: () => void
  onClose: () => void
}) {
  const [local, setLocal] = useState<AudioProcessingConfig>(config)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-t-3xl p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-300 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">🎛️ 오디오 가공 설정</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-sm">✕</button>
        </div>
        <p className="text-xs text-slate-500 -mt-2">
          Deepgram에 보내는 음성의 가공 정도입니다. 변경값은 <span className="text-slate-400">다음 녹음부터</span> 적용돼요.
          가공본 ▶️로 들어보며 조절하세요.
        </p>

        {/* 브라우저 내장 처리 */}
        <div className="space-y-3">
          <p className="text-sm font-medium text-slate-300">🎙️ 마이크 입력 (브라우저 내장)</p>
          {([
            { key: 'echoCancellation', label: '에코 제거', desc: '스피커 소리 되울림 억제' },
            { key: 'noiseSuppression', label: '노이즈 억제', desc: '배경 소음 제거' },
            { key: 'autoGainControl', label: '자동 음량 조절', desc: '작은 소리 증폭' },
          ] as const).map((opt) => (
            <div key={opt.key} className="flex items-center justify-between">
              <div>
                <p className="text-sm text-white">{opt.label}</p>
                <p className="text-xs text-slate-500">{opt.desc}</p>
              </div>
              <ConfigToggle on={local[opt.key]} onToggle={() => setLocal(p => ({ ...p, [opt.key]: !p[opt.key] }))} />
            </div>
          ))}
        </div>

        {/* HighPass */}
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">🔈 HighPass (저음 제거)</p>
            <ConfigToggle on={local.highpass.enabled} onToggle={() => setLocal(p => ({ ...p, highpass: { ...p.highpass, enabled: !p.highpass.enabled } }))} />
          </div>
          <ConfigSlider label="차단 주파수" value={local.highpass.freq} min={20} max={400} step={10} unit="Hz"
            disabled={!local.highpass.enabled}
            onChange={(v) => setLocal(p => ({ ...p, highpass: { ...p.highpass, freq: v } }))} />
        </div>

        {/* LowPass */}
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">🔉 LowPass (고음 제거)</p>
            <ConfigToggle on={local.lowpass.enabled} onToggle={() => setLocal(p => ({ ...p, lowpass: { ...p.lowpass, enabled: !p.lowpass.enabled } }))} />
          </div>
          <ConfigSlider label="차단 주파수" value={local.lowpass.freq} min={2000} max={16000} step={500} unit="Hz"
            disabled={!local.lowpass.enabled}
            onChange={(v) => setLocal(p => ({ ...p, lowpass: { ...p.lowpass, freq: v } }))} />
        </div>

        {/* Compressor */}
        <div className="space-y-2 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-300">🎚️ Compressor (소음 억제)</p>
            <ConfigToggle on={local.compressor.enabled} onToggle={() => setLocal(p => ({ ...p, compressor: { ...p.compressor, enabled: !p.compressor.enabled } }))} />
          </div>
          <ConfigSlider label="Threshold" value={local.compressor.threshold} min={-100} max={0} step={1} unit="dB"
            disabled={!local.compressor.enabled}
            onChange={(v) => setLocal(p => ({ ...p, compressor: { ...p.compressor, threshold: v } }))} />
          <ConfigSlider label="Ratio" value={local.compressor.ratio} min={1} max={20} step={1} unit=":1"
            disabled={!local.compressor.enabled}
            onChange={(v) => setLocal(p => ({ ...p, compressor: { ...p.compressor, ratio: v } }))} />
          <ConfigSlider label="Knee" value={local.compressor.knee} min={0} max={40} step={1} unit="dB"
            disabled={!local.compressor.enabled}
            onChange={(v) => setLocal(p => ({ ...p, compressor: { ...p.compressor, knee: v } }))} />
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onReset}
            className="flex-1 bg-slate-700 hover:bg-slate-600 text-white rounded-2xl py-3 text-sm font-medium transition-colors"
          >
            기본값 복원
          </button>
          <button
            onClick={() => { onApply(local); onClose() }}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl py-3 text-sm font-medium transition-colors"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 📊 학습 진행 상황 모달 (step 기반) ───────────────────
function ProgressModal({
  scenario,
  stepProgress,
  book,
  unit,
  unitTitle,
  onClose,
}: {
  scenario: LessonScenario | null
  stepProgress: StepProgress | null
  book: string
  unit: number
  unitTitle?: string | null
  onClose: () => void
}) {
  const progress = stepProgress?.progress_rate || 0
  const naturalSet = new Set(stepProgress?.natural_steps || [])
  const hintSet = new Set(stepProgress?.hint_used_steps || [])
  const allSteps = (scenario?.phases || []).flatMap(p => p.steps || [])
  const naturalDone = naturalSet.size
  const totalSteps = scenario?.total_steps || allSteps.length

  const stepLabel = (s: LessonScenario['phases'][number]['steps'][number]) =>
    s.target_word || s.expected_pattern || `Step ${s.step}`

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-t-3xl p-6 space-y-4 animate-in slide-in-from-bottom-4 duration-300 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">📊 오늘의 학습 진행</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-sm">✕</button>
        </div>

        <div>
          <p className="text-sm text-white font-medium">{book}</p>
          <p className="text-xs text-slate-400">Unit {unit}{unitTitle ? ` — ${unitTitle}` : ''}</p>
        </div>

        {/* 진행률 바 — 힌트 없이 스스로 말한 step 기준 */}
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-xs text-slate-500">스스로 말한 단어 {naturalDone}/{totalSteps}</span>
            <span className={cn('text-xs font-bold tabular-nums',
              progress >= 80 ? 'text-emerald-400' : progress >= 50 ? 'text-amber-400' : 'text-slate-400'
            )}>{progress}%</span>
          </div>
          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all duration-700',
              progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-violet-500'
            )} style={{ width: `${progress}%` }} />
          </div>
        </div>

        {allSteps.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-4">오늘은 자유 대화 모드예요. 마이크를 누르고 말해보세요!</p>
        ) : (
          <div className="space-y-1.5">
            {allSteps.map((s) => {
              const isNatural = naturalSet.has(s.step)
              const isHint = hintSet.has(s.step)
              return (
                <div key={s.step} className="flex items-center justify-between">
                  <span className="text-sm text-slate-200">
                    <span className="text-slate-600 text-xs mr-1.5">{s.step}.</span>
                    {stepLabel(s)}
                  </span>
                  <span className="text-xs">
                    {isNatural
                      ? <span className="text-emerald-400">✅ 스스로</span>
                      : isHint
                        ? <span className="text-amber-400">💡 힌트</span>
                        : <span className="text-slate-600">⬜</span>}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── 📋 시나리오·지침 인스펙터 모달 (교사/운영자용) ───────
interface GptRulesShape {
  flow?: string[]
  counting_rules?: { count_yes?: string; count_no?: string[] }
}
function ScenarioInspectorModal({
  scenario,
  nickname,
  onClose,
}: {
  scenario: LessonScenario | null
  nickname?: string | null
  onClose: () => void
}) {
  // {{nickname}} 치환 — system-prompt 빌더와 동일하게 미리보기
  const fill = (s?: string | null) =>
    (s ?? '').replace(/\{\{nickname\}\}/g, nickname || '학생')

  const rules = (scenario?.gpt_rules ?? {}) as GptRulesShape
  const flow = rules.flow ?? []
  const countYes = rules.counting_rules?.count_yes
  const countNo = rules.counting_rules?.count_no ?? []
  const closing = scenario?.closing as { ai_line?: string } | string | null | undefined
  const closingLine =
    typeof closing === 'string' ? closing : closing?.ai_line ?? ''

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-t-3xl p-6 space-y-4 animate-in slide-in-from-bottom-4 duration-300 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">📋 시나리오 · 지침</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white text-sm">✕</button>
        </div>

        {!scenario ? (
          <p className="text-sm text-slate-500 text-center py-6">
            오늘 교재/Unit에는 시나리오 템플릿이 없어요.<br />
            일반 Coty 자유 대화 모드입니다.
          </p>
        ) : (
          <>
            {/* 개요 */}
            <div className="space-y-0.5">
              <p className="text-sm text-white font-medium">{scenario.book}</p>
              <p className="text-xs text-slate-400">
                Unit {scenario.unit}{scenario.title ? ` — ${scenario.title}` : ''} · 총 {scenario.total_steps} steps
              </p>
              {scenario.target_words?.length > 0 && (
                <p className="text-xs text-emerald-400">🎯 단어: {scenario.target_words.join(', ')}</p>
              )}
              {scenario.target_patterns?.length > 0 && (
                <p className="text-xs text-violet-300">💬 패턴: {scenario.target_patterns.join(', ')}</p>
              )}
            </div>

            {/* AI 공통 지침 (system-prompt.ts) */}
            <div className="bg-slate-800/50 rounded-xl p-3 space-y-2 border border-slate-700/40">
              <p className="text-xs font-semibold text-amber-300">🧭 AI 공통 지침 (모든 수업 적용)</p>
              <ol className="list-decimal list-inside space-y-0.5">
                {[
                  'steps를 순서대로 진행한다. step을 절대 건너뛰지 마.',
                  '절대 먼저 정답을 말하지 않는다.',
                  '말할 때는 항상 학생에게 질문하거나 말하도록 요청하는 말로 끝맺음한다.',
                  '학생이 틀리거나 모르겠다고 하면 hint_line을 준다 (hint_used: true).',
                  'hint를 줬는데도 모르면 답을 살짝 알려주되 학생이 직접 말하게 유도한다.',
                  '새 step 시작 시 반드시 해당 step의 ai_line을 그대로 사용한다.',
                  'message의 마지막 문장은 반드시 학생에게 하는 질문이어야 한다.',
                  "It's = It is, That's = That is 등 축약형/비축약형 동일하게 인정한다.",
                  'target_word가 포함되어 있으면 정답으로 인정한다.',
                ].map((r, i) => (
                  <li key={i} className="text-xs text-slate-300 leading-relaxed">{r}</li>
                ))}
              </ol>
            </div>

            {/* AI 수업별 지침 (gpt_rules) */}
            {(flow.length > 0 || countYes || countNo.length > 0) && (
              <div className="bg-slate-800/50 rounded-xl p-3 space-y-2 border border-slate-700/40">
                <p className="text-xs font-semibold text-amber-300">🧭 수업별 특이 지침</p>
                {flow.length > 0 && (
                  <ol className="list-decimal list-inside space-y-0.5">
                    {flow.map((r, i) => (
                      <li key={i} className="text-xs text-slate-300 leading-relaxed">{fill(r)}</li>
                    ))}
                  </ol>
                )}
                {(countYes || countNo.length > 0) && (
                  <div className="text-xs space-y-0.5 pt-1 border-t border-slate-700/40">
                    {countYes && <p className="text-emerald-400">✅ 진도 카운트 O: {countYes}</p>}
                    {countNo.map((c, i) => (
                      <p key={i} className="text-slate-500">🚫 카운트 X: {c}</p>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 시나리오 phases → steps */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400">🎬 수업 시나리오</p>
              {(scenario.phases || []).map((phase) => (
                <div key={phase.phase} className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-300">
                    Phase {phase.phase}{phase.label ? ` · ${phase.label}` : ''}
                  </p>
                  <div className="space-y-2 pl-2 border-l border-slate-700/50">
                    {(phase.steps || []).map((s) => (
                      <div key={s.step} className="space-y-0.5">
                        <p className="text-xs text-slate-200">
                          <span className="text-slate-600 mr-1">{s.step}.</span>
                          {s.target_word && <span className="text-emerald-400 font-medium">{s.target_word}</span>}
                          {s.expected_pattern && (
                            <span className="text-violet-300 ml-1">— “{s.expected_pattern}”</span>
                          )}
                        </p>
                        {s.scene_kr && <p className="text-[11px] text-slate-500 pl-3">🎭 {s.scene_kr}</p>}
                        {s.ai_line && <p className="text-[11px] text-sky-300/80 pl-3">🗣️ {fill(s.ai_line)}</p>}
                        {s.accept_variants && s.accept_variants.length > 0 && (
                          <p className="text-[11px] text-slate-500 pl-3">✔️ 인정: {s.accept_variants.join(' / ')}</p>
                        )}
                        {s.hint_line && <p className="text-[11px] text-amber-300/70 pl-3">💡 {fill(s.hint_line)}</p>}
                        {s.reaction && <p className="text-[11px] text-slate-500 pl-3">🎉 {fill(s.reaction)}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* closing */}
            {closingLine && (
              <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/40">
                <p className="text-xs font-semibold text-slate-400 mb-1">🏁 마무리</p>
                <p className="text-[11px] text-sky-300/80">🗣️ {fill(closingLine)}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── 상단 상태 인디케이터 (아바타 대체 — 공간 최소화) ──
function StatusBar({ status }: { status: string }) {
  const STATUS_LABEL: Record<string, string> = {
    idle:       'AI 선생님 대기 중',
    listening:  '듣고 있어요...',
    processing: '생각하는 중...',
    speaking:   'AI 선생님 말하는 중',
  }
  const config: Record<string, { dot: string; text: string; emoji: string }> = {
    idle:       { dot: 'bg-slate-500',               text: 'text-slate-400',   emoji: '🤖' },
    listening:  { dot: 'bg-emerald-400 animate-ping', text: 'text-emerald-400', emoji: '👂' },
    processing: { dot: 'bg-amber-400 animate-pulse',  text: 'text-amber-400',   emoji: '⚙️' },
    speaking:   { dot: 'bg-violet-400 animate-pulse', text: 'text-violet-400',  emoji: '🗣️' },
  }
  const c = config[status] ?? config.idle
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <span className="text-base">{c.emoji}</span>
      <div className="relative flex items-center justify-center w-2.5 h-2.5">
        <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75', c.dot)} />
        <span className={cn('relative inline-flex rounded-full h-2 w-2', c.dot.replace(' animate-ping','').replace(' animate-pulse',''))} />
      </div>
      <p className={cn('text-xs font-medium', c.text)}>{STATUS_LABEL[status]}</p>
    </div>
  )
}

// 단어 confidence → 색상 표시
function WordConfidenceDisplay({ words }: { words: WordResult[] }) {
  if (!words.length) return null
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-1">
      {words.map((w, i) => {
        const color = w.confidence >= 0.9
          ? 'text-emerald-400'
          : w.confidence >= 0.7
          ? 'text-amber-400'
          : 'text-red-400'
        return (
          <span key={i} className={cn('text-sm font-medium', color)}>
            {w.word}
          </span>
        )
      })}
    </div>
  )
}

// ── 힌트 박스 컴포넌트 ─────────────────────────────────
function HintBox({
  msgId,
  hintLine,
  acceptVariants,
  onHintSeen,
  alreadySeen,
}: {
  msgId: string
  hintLine?: string
  acceptVariants?: string[]
  onHintSeen: (id: string) => void
  alreadySeen: boolean
}) {
  const [hintVisible, setHintVisible] = useState(alreadySeen)
  const [variantsVisible, setVariantsVisible] = useState(false)

  const handleShowHint = () => {
    setHintVisible(true)
    onHintSeen(msgId)
  }

  if (!hintLine && (!acceptVariants || acceptVariants.length === 0)) return null

  return (
    <div className="max-w-[85%] mt-1.5">
      {!hintVisible ? (
        // 1단계: 힌트 보기 버튼
        <button
          onClick={handleShowHint}
          className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700/50 hover:border-slate-500 rounded-full px-3 py-1 transition-colors"
        >
          💡 힌트 보기
        </button>
      ) : (
        <div className="bg-slate-800/60 border border-amber-700/30 rounded-xl p-3 space-y-2">
          {/* 2단계: hint_line 표시 */}
          {hintLine && (
            <div>
              <p className="text-[10px] text-amber-400/70 font-semibold mb-1">💡 힌트</p>
              <p className="text-xs text-amber-200/90">{hintLine}</p>
            </div>
          )}
          {/* 가능한 답변 버튼 또는 목록 */}
          {acceptVariants && acceptVariants.length > 0 && (
            !variantsVisible ? (
              // 3단계: 가능한 답변 보기 버튼
              <button
                onClick={() => setVariantsVisible(true)}
                className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700/50 hover:border-slate-500 rounded-full px-3 py-1 transition-colors"
              >
                📝 가능한 답변 보기
              </button>
            ) : (
              // 4단계: 가능한 답변 목록 표시
              <div>
                <p className="text-[10px] text-slate-400/70 font-semibold mb-1">가능한 답변 (말로 해보세요!)</p>
                <div className="flex flex-wrap gap-1.5">
                  {acceptVariants.map((variant, i) => (
                    <span
                      key={i}
                      className="bg-slate-700/80 border border-slate-600/40 text-slate-300 text-xs px-3 py-1.5 rounded-full select-none"
                    >
                      {variant}
                    </span>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      )}
    </div>
  )
}

// ── 영문 보기 박스 컴포넌트 ─────────────────────────────
// AI 영어 문장은 기본 숨김 — 듣기로 따라오는 학생은 보지 않고 대화 지속,
// 필요한 학생만 "영문 보기"를 눌러 확인. 왼쪽 "다시 듣기"로 음성 재생.
function EnglishBox({ text, onReplay, replayDisabled }: {
  text: string
  onReplay: () => void
  replayDisabled: boolean
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <button
          onClick={onReplay}
          disabled={replayDisabled}
          className="text-xs text-violet-400/60 hover:text-violet-300 disabled:opacity-30 border border-violet-700/40 hover:border-violet-500 rounded-full px-3 py-1 transition-colors"
        >
          🔁 다시 듣기
        </button>
        <button
          onClick={() => setVisible(v => !v)}
          className="text-xs text-violet-400/60 hover:text-violet-300 border border-violet-700/40 hover:border-violet-500 rounded-full px-3 py-1 transition-colors"
        >
          {visible ? '🙈 영문 숨기기' : '👀 영문 보기'}
        </button>
      </div>
      {visible && <span className="text-sm block">{text}</span>}
    </div>
  )
}

// ── 번역 박스 컴포넌트 ─────────────────────────────────
function TranslationBox({ translation }: { translation: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="mt-1">
      {!visible ? (
        <button
          onClick={() => setVisible(true)}
          className="text-xs text-slate-500 hover:text-slate-300 border border-slate-700/50 hover:border-slate-500 rounded-full px-3 py-1 transition-colors"
        >
          🇰🇷 번역 보기
        </button>
      ) : (
        <p className="text-xs text-violet-300/70 border-t border-violet-700/30 pt-2 mt-1 leading-relaxed">
          {translation}
        </p>
      )}
    </div>
  )
}

interface LogEntry {
  id: number
  time: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
}

// ── 수업 시작 확인 카드 (로그인 직후) ──────────────────
function ConfirmStartCard({
  book, unit, scenario, attemptCount, completedCount, isFirstTime, onStart, onPick, onExit,
}: {
  book: string
  unit: number
  scenario: LessonScenario | null
  attemptCount: number
  completedCount: number
  isFirstTime: boolean   // 학생 전체 학습 이력이 전무한 경우(Book/Unit 무관)
  onStart: () => void
  onPick: () => void
  onExit: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-slate-900 border border-slate-700/50 rounded-3xl p-6 space-y-5 animate-in fade-in zoom-in-95 duration-300">
        {isFirstTime ? (
          <>
            <div className="text-center space-y-2">
              <p className="text-3xl">👋</p>
              <h2 className="text-white font-bold text-lg">첫 수업에 오신 것을 환영합니다</h2>
              <p className="text-sm text-slate-400">학습할 내용을 선택해 주세요.</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={onPick}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl py-3.5 text-sm font-bold transition-colors"
              >
                📖 Unit 선택하기
              </button>
              <button
                onClick={onExit}
                className="w-full text-slate-400 hover:text-white rounded-2xl py-2.5 text-sm font-medium transition-colors"
              >
                🚪 종료
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-center space-y-1">
              <p className="text-3xl">📚</p>
              <h2 className="text-white font-bold text-lg">지난 시간에 배운 내용이에요</h2>
            </div>

            <div className="bg-slate-800/60 rounded-2xl p-4 space-y-1 text-center">
              <p className="text-sm text-emerald-300 font-medium">{book}</p>
              <p className="text-base text-white font-bold">Unit {unit}</p>
              {scenario?.title && <p className="text-xs text-slate-400">{scenario.title}</p>}
              {!scenario && <p className="text-[11px] text-slate-500 mt-1">이 Unit은 자유 대화로 진행해요</p>}
            </div>

            {(attemptCount > 0 || completedCount > 0) && (
              <p className="text-center text-xs text-slate-400">
                지금까지 <span className="text-violet-300 font-semibold">{attemptCount}번</span> 했어요
                {completedCount > 0 && <> · <span className="text-emerald-400 font-semibold">{completedCount}회 완료</span></>}
              </p>
            )}

            <div className="space-y-2">
              <button
                onClick={onStart}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl py-3.5 text-sm font-bold transition-colors"
              >
                🔁 복습하기
              </button>
              <button
                onClick={onPick}
                className="w-full bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-2xl py-3 text-sm font-medium transition-colors"
              >
                📖 Unit 선택하기
              </button>
              <button
                onClick={onExit}
                className="w-full text-slate-400 hover:text-white rounded-2xl py-2.5 text-sm font-medium transition-colors"
              >
                🚪 종료
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Book·Unit 선택 카드 ────────────────────────────────
function BookUnitPickerCard({
  initialBook, initialUnit, onSelect, onCancel,
}: {
  initialBook: string
  initialUnit: number
  onSelect: (book: string, unit: number) => void
  onCancel: () => void
}) {
  const { booksByLevel, level_order, getUnits } = useCurriculum()
  const [book, setBook] = useState(initialBook)
  const [unit, setUnit] = useState(initialUnit)
  const units = getUnits(book)
  const selectedUnit = units.find(u => u.unit === unit)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-slate-900 border border-slate-700/50 rounded-t-3xl p-6 space-y-5 animate-in slide-in-from-bottom-4 duration-300 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-white font-semibold text-base">📖 학습할 Book · Unit 선택</h2>
          <button onClick={onCancel} className="text-slate-500 hover:text-white text-sm">✕</button>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-slate-500">Book</p>
          <select
            value={book}
            onChange={(e) => { setBook(e.target.value); setUnit(1) }}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
          >
            {level_order.map(level => (
              booksByLevel[level] && (
                <optgroup key={level} label={`── ${level} ──`}>
                  {booksByLevel[level].map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </optgroup>
              )
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-slate-500">Unit</p>
          <select
            value={unit}
            onChange={(e) => setUnit(Number(e.target.value))}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500"
          >
            {units.map(u => (
              <option key={u.unit} value={u.unit}>
                Unit {u.unit}{u.title ? ` — ${u.title}` : ''}
              </option>
            ))}
          </select>
        </div>

        {selectedUnit && (
          <div className="bg-slate-800/60 rounded-xl px-3 py-2 space-y-1">
            <p className="text-xs text-emerald-400">학습 단어</p>
            <p className="text-xs text-slate-300 leading-relaxed">
              {selectedUnit.words.split(',').slice(0, 8).join(', ')}...
            </p>
          </div>
        )}

        <button
          onClick={() => onSelect(book, unit)}
          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl py-3.5 text-sm font-bold transition-colors"
        >
          🚀 이 Unit으로 시작하기
        </button>
      </div>
    </div>
  )
}

// ── 메인 페이지 ───────────────────────────────────────
export default function StudentPage() {
  const {
    avatarStatus, interimText, interimWords,
    setAvatarStatus, setInterimText, setSpeechResult, setLatency,
    setInterimWords, setFinalWords,
  } = useAudioStore()
  const { isLogDrawerOpen, setLogDrawerOpen, messages, addMessage, clearMessages } = useUIStore()
  const { studentId, sessionId, studentNickname, ready, settings, persona, updateSettings } = useStudentSession()

  const router = useRouter()
  const supabase = createClient()

  // ── 회차(attempt) 기반 수업 오케스트레이션 ──────────────
  // lessonState: loading→confirm(복습/시작 확인)→active(수업중) / picking(Book·Unit 선택)
  // 수업 완료 후 Coty의 마무리 인사가 끝나면(sessionEnded) 다시 confirm 카드로 복귀
  type LessonState = 'loading' | 'confirm' | 'picking' | 'active'
  const [lessonState, setLessonState] = useState<LessonState>('loading')
  const [activeBook, setActiveBook] = useState<string>(settings.current_book)
  const [activeUnit, setActiveUnit] = useState<number>(settings.current_unit)
  const [activeScenario, setActiveScenario] = useState<LessonScenario | null>(null)
  const [progressId, setProgressId] = useState<string | null>(null)
  const [resumeProgress, setResumeProgress] = useState<StepProgress | null>(null)
  const [attemptNumber, setAttemptNumber] = useState(0)   // 현재 회차 번호 (몇 번째 진행)
  const [attemptCount, setAttemptCount] = useState(0)     // 지금까지 누적 시도 횟수
  const [completedCount, setCompletedCount] = useState(0) // 누적 완료 횟수
  const [hasHistory, setHasHistory] = useState(false)     // 학생 전체 학습 이력(Book/Unit 무관) — false면 첫 학습
  const initedRef = useRef(false)

  const { sendToGPT, isSpeaking, stopSpeaking, progress, stepProgress, sessionEnded, currentScene, start, reset } = useConversation({
    sessionId, studentId, studentNickname,
    ttsSpeed: settings.tts_speed,
    currentBook: activeBook,
    currentUnit: activeUnit,
    persona,
    scenario: activeScenario,
    initialProgress: resumeProgress,
    progressId,
    // 모든 step 완료 → 누적 완료 횟수만 +1. 카드는 마무리 인사 후 sessionEnded 신호로 표시.
    onUnitComplete: () => { setCompletedCount(c => c + 1) },
  })

  // 시나리오 + 회차 통계 로드 (행 생성 없음)
  const loadUnit = useCallback(async (book: string, unit: number) => {
    if (!studentId) return
    try {
      const res = await fetch(`/api/lesson-scenario?student_id=${studentId}&book=${encodeURIComponent(book)}&unit=${unit}`)
      const data = res.ok ? await res.json() : null
      setActiveBook(book)
      setActiveUnit(unit)
      setActiveScenario(data?.scenario ?? null)
      setAttemptCount(data?.attempt_count ?? 0)
      setCompletedCount(data?.completed_count ?? 0)
      setHasHistory(data?.has_history ?? false)
    } catch {
      setActiveBook(book)
      setActiveUnit(unit)
      setActiveScenario(null)
    }
  }, [studentId])

  // 진행 중 회차 이어하기 (새로고침) — 인사/회차 생성 없음
  const resumeAttempt = useCallback(async (book: string, unit: number, pid: string) => {
    if (!studentId) return
    try {
      const res = await fetch(`/api/lesson-scenario?student_id=${studentId}&book=${encodeURIComponent(book)}&unit=${unit}&progress_id=${pid}`)
      const data = res.ok ? await res.json() : null
      setActiveBook(book)
      setActiveUnit(unit)
      setActiveScenario(data?.scenario ?? null)
      setAttemptCount(data?.attempt_count ?? 0)
      setCompletedCount(data?.completed_count ?? 0)
      setHasHistory(data?.has_history ?? false)
      if (data?.resume) {
        setResumeProgress(data.resume)
        setAttemptNumber(data.resume.attempt ?? 0)
        setProgressId(pid)
      }
    } catch {
      setActiveBook(book)
      setActiveUnit(unit)
    }
  }, [studentId])

  // 새 회차 시작 — 진도율 0부터, 기존 회차는 누적 보존 (시작하기/한 번 더/Unit 선택)
  const startAttempt = useCallback(async (book: string, unit: number) => {
    if (!studentId) return
    // POST 실패(예: DB attempt 컬럼 미반영) 시에도 같은 단원이면 직전 시나리오를 유지해 진도 바가 사라지지 않게
    const fallbackScenario = (activeBook === book && activeUnit === unit) ? activeScenario : null
    reset()
    clearMessages()
    setResumeProgress(null)
    setActiveBook(book)
    setActiveUnit(unit)
    setLessonState('active')
    setHasHistory(true)   // 수업을 시작하면 학습 이력 생성 → 이후 카드는 복습 변형

    let scen: LessonScenario | null = fallbackScenario
    let pid: string | null = null
    try {
      const res = await fetch('/api/lesson-scenario', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', student_id: studentId, book, unit }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        console.error(`회차 시작 실패 (HTTP ${res.status}) — DB attempt 컬럼/마이그레이션 확인 필요:`, data)
      }
      if (data?.scenario) scen = data.scenario
      pid = data?.progress?.id ?? null
      setActiveScenario(scen)
      setProgressId(pid)
      setAttemptNumber(data?.attempt_number ?? 1)
      setAttemptCount(data?.attempt_number ?? 1)
      setCompletedCount(data?.completed_count ?? 0)
    } catch (e) {
      console.error('회차 시작 오류:', e)
      setActiveScenario(scen)
    }

    if (pid) {
      sessionStorage.setItem('activeProgressId', pid)
      sessionStorage.setItem('activeBook', book)
      sessionStorage.setItem('activeUnit', String(unit))
    } else {
      sessionStorage.removeItem('activeProgressId')
    }
    start({ scenario: scen, progressId: pid, book, unit })
  }, [studentId, activeBook, activeUnit, activeScenario, reset, clearMessages, start])

  // 종료 — 진도·로그·리포트는 DB에 누적 보존, 화면/세션만 정리하고 로그아웃
  const handleExit = useCallback(async () => {
    clearMessages()
    sessionStorage.clear()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }, [clearMessages, supabase, router])

  // 수업 완료 후 Coty의 마무리 인사가 끝나면 → 복습/종료 선택 카드로 복귀
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (sessionEnded) setLessonState('confirm')
  }, [sessionEnded])

  // Book·Unit 선택 완료 → 프로필에 저장하고 새 회차 시작
  const handlePickUnit = useCallback((book: string, unit: number) => {
    updateSettings({ current_book: book, current_unit: unit })
    startAttempt(book, unit)
  }, [updateSettings, startAttempt])

  // 최초 진입 — 프로필 로드 후: 새로고침이면 이어하기, 신규 로그인이면 확인 카드
  useEffect(() => {
    if (!ready || !studentId || initedRef.current) return
    initedRef.current = true

    const savedPid = sessionStorage.getItem('activeProgressId')
    const savedBook = sessionStorage.getItem('activeBook')
    const savedUnit = sessionStorage.getItem('activeUnit')
    if (savedPid && savedBook && savedUnit) {
      // mount 시 1회 비동기 이어하기 (setState는 await 이후 콜백에서만 발생)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      resumeAttempt(savedBook, Number(savedUnit), savedPid).then(() => setLessonState('active'))
    } else {
      loadUnit(settings.current_book, settings.current_unit).then(() => setLessonState('confirm'))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, studentId])

  const [showSettings, setShowSettings] = useState(false)
  const [showAudioSettings, setShowAudioSettings] = useState(false)
  const [showProgress, setShowProgress] = useState(false)
  const [showScenario, setShowScenario] = useState(false)

  // 오디오 가공 설정 (localStorage 유지) — useWebSpeech 파이프라인에 전달
  const { config: audioConfig, setConfig: setAudioConfig, resetConfig: resetAudioConfig, hydrate: hydrateAudioConfig } = useAudioConfigStore()
  useEffect(() => { hydrateAudioConfig() }, [hydrateAudioConfig])

  // Deepgram keyword boosting(문맥 힌트)으로 전달할 단어들 모으기:
  //   ① 오늘 Unit의 target 단어  ② 시나리오 stage 타깃  ③ AI가 방금 던진 질문 속 핵심어
  // 학생이 다음에 말할 가능성이 높은 단어를 미리 알려줘 연음/뭉갠 발음 인식을 보완한다.
  const { getUnitData } = useCurriculum()
  const unitForKeywords = getUnitData(activeBook, activeUnit)
  // 흔한 기능어는 부스트해도 도움이 안 되고 오인식만 늘리므로 제외
  const STT_STOPWORDS = new Set([
    'the','and','for','you','your','are','was','were','this','that','with','what','how','who',
    'where','when','why','can','will','did','does','have','has','had','not','but','about',
    'they','them','his','her','she','him','our','out','from','into','its','too','let','lets','okay',
  ])
  const tokenize = (s: string): string[] =>
    (s.toLowerCase().match(/[a-z']{3,}/g) || []).filter(w => !STT_STOPWORDS.has(w))
  const unitWords = unitForKeywords?.words
    ? unitForKeywords.words.split(',').map(w => w.trim()).filter(Boolean)
    : []
  // 시나리오 target 단어/패턴 핵심어 → STT keyword boosting
  const scenarioWords = [
    ...(activeScenario?.target_words || []),
    ...(activeScenario?.target_patterns || []).flatMap(p => tokenize(p)),
  ]
  const lastAiText = [...messages].reverse().find(m => m.role === 'ai')?.content || ''
  const aiWords = tokenize(lastAiText)
  const sttKeywords = [...unitWords, ...scenarioWords, ...aiWords]

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const [saveMessage, setSaveMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isHolding, setIsHolding] = useState(false)
  const [seenHints, setSeenHints] = useState<Set<string>>(new Set())
  const hintUsedRef = useRef(false)  // 현재 발화에서 힌트 봤는지
  const startTimeRef = useRef<number>(0)
  const logIdRef = useRef(0)
  const sentRef = useRef(false)  // 중복 전송 방지 플래그

  // 새 메시지 or 상태 변화 시 자동 스크롤
  useEffect(() => {
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, 50)
    return () => clearTimeout(timer)
  }, [messages, isHolding, interimText, isSpeaking])

  const addLog = useCallback((message: string, type: LogEntry['type'] = 'info') => {
    const now = new Date()
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
    setLogs((prev) => [{ id: logIdRef.current++, time, message, type }, ...prev].slice(0, 50))
  }, [])

  // Path B: Blob → Whisper 서버
  const handleBlobReady = useCallback(async (blob: Blob) => {
    addLog(`Path B: Whisper 전송 중... (${(blob.size / 1024).toFixed(1)}KB)`, 'warning')
    setAvatarStatus('processing')
    const whisperUrl = process.env.NEXT_PUBLIC_WHISPER_SERVER_URL || 'http://localhost:8000'
    const formData = new FormData()
    formData.append('audio_blob', blob, 'audio.webm')
    formData.append('language', 'en')
    try {
      const start = Date.now()
      const res = await fetch(`${whisperUrl}/api/v1/stt`, { method: 'POST', body: formData })
      const data = await res.json()
      const latency = Date.now() - start
      setLatency(latency)
      setSpeechResult({ text: data.text, confidence: data.confidence, path: 'B', isFinal: true })
      addLog(`Path B 완료: "${data.text}" (${latency}ms)`, 'success')
    } catch {
      addLog('Path B 실패: Whisper 서버 연결 불가', 'error')
      setAvatarStatus('idle')
    }
  }, [addLog, setAvatarStatus, setSpeechResult, setLatency])

  const handleBlobSaved = useCallback((success: boolean, filename?: string) => {
    // filename은 항상 undefined이므로 success만 체크
    if (success) {
      addLog('녹음 저장 성공 (재생 가능)', 'success')
    } else {
      addLog('녹음 저장 실패', 'error')
    }
  }, [addLog])

  const { startRecording, discardBlob, lastBlobUrl } = useMediaRecorder({
    onBlobReady: handleBlobReady,
    onBlobSaved: handleBlobSaved,
  })

  const handleInterim = useCallback((text: string, words?: WordResult[]) => {
    setInterimText(text)
    if (words) setInterimWords(words)
  }, [setInterimText, setInterimWords])

  const handleFinalResult = useCallback((text: string, confidence: number, words?: WordResult[]) => {
    if (sentRef.current) return
    sentRef.current = true

    const normalized = text.trim()
    const capitalized = normalized.charAt(0).toUpperCase() + normalized.slice(1)
    const punctuated = /[.?!]$/.test(capitalized) ? capitalized : capitalized + '.'

    const latency = Date.now() - startTimeRef.current
    setLatency(latency)
    setSpeechResult({ text: punctuated, confidence, path: 'A', isFinal: true })
    setInterimText('')
    setInterimWords([])
    if (words) setFinalWords(words)
    discardBlob()
    addLog(`Path A: "${punctuated}" (confidence: ${(confidence * 100).toFixed(0)}%, ${latency}ms)`, 'success')
    sendToGPT(punctuated, { sttPath: 'A', confidence, latencyMs: latency, hintUsed: hintUsedRef.current }, words)
    // 답변 후 힌트 상태 초기화
    setSeenHints(new Set())
  }, [discardBlob, setSpeechResult, setLatency, setInterimText, setInterimWords, setFinalWords, addLog, sendToGPT])

  const handleFallback = useCallback(async (confidence: number, partialText?: string) => {
    if (sentRef.current) return
    sentRef.current = true

    addLog(`인식 불명확: confidence ${(confidence * 100).toFixed(0)}% — 재시도 요청`, 'warning')
    discardBlob()
    setInterimText('')
    setInterimWords([])
    setAvatarStatus('speaking')

    let msgEn = ''
    let msgKo = ''

    if (partialText && partialText.trim() && confidence > 0) {
      // 부분 인식된 텍스트가 있으면 GPT로 자연스럽게 되물음
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [],
            studentText: `__CLARIFY__:${partialText}`,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          msgEn = data.text
          msgKo = '(잘 못 들었어요. 다시 한 번 말씀해 주시겠어요?)'
        }
      } catch { /* ignore */ }
    }

    // GPT 실패 or 완전 인식 실패 → 기본 메시지
    if (!msgEn) {
      const retryMessages = confidence === 0
        ? [
            { en: "I couldn't hear you clearly. There might be too much background noise. Could you try again?", ko: "잘 못 들었어요. 주변 소음이 많은 것 같아요. 다시 말씀해 주시겠어요?" },
            { en: "I had trouble hearing that. Could you speak a bit louder and try again?", ko: "소리가 잘 안 들렸어요. 조금 더 크게 말씀해 주시겠어요?" },
          ]
        : [
            { en: "Sorry, I couldn't quite hear you. Could you say that again?", ko: "잘 못 들었어요. 다시 한 번 말씀해 주시겠어요?" },
            { en: "I didn't catch that clearly. Could you repeat that, please?", ko: "정확히 듣지 못했어요. 다시 말씀해 주시겠어요?" },
          ]
      const selected = retryMessages[Math.floor(Math.random() * retryMessages.length)]
      msgEn = selected.en
      msgKo = selected.ko
    }

    // 대화창에 표시
    addMessage({
      id: `fallback_${Date.now()}`,
      role: 'ai',
      content: `${msgEn}\n(${msgKo})`,
      createdAt: new Date().toISOString(),
    })

    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: msgEn, voice: 'nova' }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        await new Promise<void>((resolve) => {
          audio.onended = () => { URL.revokeObjectURL(url); resolve() }
          audio.onerror = () => { resolve() }
          audio.play().catch(() => resolve())
        })
      }
    } catch { /* ignore */ }
    setAvatarStatus('idle')
  }, [discardBlob, addLog, addMessage, setAvatarStatus, setInterimText, setInterimWords])

  const handleError = useCallback((error: string) => {
    addLog(`STT 오류: ${error}`, 'error')
    setAvatarStatus('idle')
    discardBlob()
  }, [addLog, setAvatarStatus, discardBlob])

  // useWebSpeech가 연 스트림을 useMediaRecorder와 공유 (마이크 중복 열기 방지)
  const handleStreamReady = useCallback((stream: MediaStream) => {
    startRecording(stream)
  }, [startRecording])

  const { isSupported, isListening, startListening, stopListening, lastProcessedBlobUrl } = useWebSpeech({
    onInterimResult: handleInterim,
    onFinalResult: handleFinalResult,
    onFallback: handleFallback,
    onError: handleError,
    onLog: (msg) => addLog(msg, 'info'),
    onStreamReady: handleStreamReady,
    processingConfig: audioConfig,
    keywords: sttKeywords,
  })

  const isTouchRef = useRef(false)  // 터치 이벤트 감지 플래그

  const replayTTS = useCallback(async (text: string) => {
    if (isSpeaking) return
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: 'nova' }),
      })
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      const speedMap = { slow: 0.75, normal: 1.0, fast: 1.25 }
      audio.playbackRate = speedMap[settings.tts_speed] ?? 1.0
      audio.onended = () => URL.revokeObjectURL(url)
      audio.play().catch(() => {})
    } catch { }
  }, [isSpeaking, settings.tts_speed])

  const handleMicStart = useCallback(async () => {
    if (!isSupported) { addLog('Web Speech API 미지원 브라우저', 'error'); return }
    if (sessionEnded) { addLog('오늘 대화가 종료되어 마이크가 비활성화되었습니다', 'info'); return }
    if (lessonState !== 'active') return  // 시작 확인/선택 카드 표시 중에는 마이크 비활성화
    if (isHolding) return
    console.group('🎤 [PAGE] handleMicStart')
    console.log('① isHolding = true')
    startTimeRef.current = Date.now()
    sentRef.current = false
    console.log('② sentRef = false (중복 전송 방지 초기화)')
    hintUsedRef.current = seenHints.size > 0
    console.log(`③ hintUsedRef = ${hintUsedRef.current} (힌트 본 메시지 수: ${seenHints.size})`)
    setIsHolding(true)
    setAvatarStatus('listening')
    setInterimText('Coty가 당신의 말을 듣고 있습니다.')
    setInterimWords([])
    console.log('④ avatarStatus = listening, interimText 설정')
    console.log('⑤ startListening() 호출 →')
    console.groupEnd()
    addLog('마이크 시작', 'info')
    startListening()
  }, [isSupported, sessionEnded, lessonState, isHolding, startListening, setAvatarStatus, setInterimText, setInterimWords, addLog, seenHints])

  const handleMicStop = useCallback(async () => {
    if (!isHolding) return  // 이미 중지된 경우 무시
    setIsHolding(false)
    setAvatarStatus('processing')
    setInterimText('Coty가 분석 중입니다...')
    setInterimWords([])
    await stopListening()
  }, [isHolding, stopListening, setAvatarStatus, setInterimText, setInterimWords])

  return (
    <main className="h-[100dvh] bg-slate-950 text-white flex flex-col overflow-hidden">
      <NavBar logCount={logs.length} onLogClick={() => setLogDrawerOpen(!isLogDrawerOpen)} onSettingsClick={() => setShowSettings(true)} />

      {/* 배경 그라디언트 */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-950 to-black pointer-events-none" />

      {/* 전체 레이아웃: NavBar 아래 꽉 채우기 */}
      <div className="relative z-10 flex flex-col flex-1 overflow-hidden max-w-lg mx-auto w-full">

        {/* ① 상태 인디케이터 (고정 높이, 작게) */}
        <div className="shrink-0 px-4 pt-1">
          <StatusBar status={avatarStatus} />
          {!isSupported && (
            <p className="text-xs text-red-400 text-center pb-1">⚠️ 이 브라우저는 음성인식을 지원하지 않습니다</p>
          )}
        </div>

        {/* ② 대화창 — 남은 세로 공간 꽉 채움 */}
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-0">
          {messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <p className="text-slate-600 text-sm text-center">
                마이크 버튼을 누르고<br />영어로 말해보세요 👇
              </p>
            </div>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={cn(
              'flex flex-col',
              msg.role === 'student' ? 'items-end' : 'items-start'
            )}>
              {/* 말풍선 */}
              <div className={cn(
                'rounded-2xl px-4 py-3 text-sm max-w-[85%]',
                msg.role === 'student'
                  ? 'bg-emerald-900/40 text-emerald-200 text-right border border-emerald-700/30'
                  : 'bg-violet-900/40 text-violet-200 border border-violet-700/30'
              )}>
                {/* 헤더 */}
                <div className="flex items-center mb-1 justify-end">
                  <span className="text-xs opacity-50">
                    {msg.role === 'student' ? '🧑 나' : '🤖 AI'}
                  </span>
                </div>
                {/* AI 메시지 — 현재 상황 설명 (한국어, 새 step 진입 시) */}
                {msg.role === 'ai' && msg.sceneKr && (
                  <div className="mb-2 pb-2 border-b border-violet-700/20">
                    {msg.sceneStep && msg.sceneStep > 0 && (
                      <p className="text-[10px] text-amber-400/70 font-semibold mb-0.5">🎭 Step {msg.sceneStep} 상황</p>
                    )}
                    <p className="text-[11px] text-amber-300/80">{msg.sceneKr}</p>
                  </div>
                )}
                {/* 학생 메시지 — words 있으면 단어별 색상 표시 */}
                {msg.role === 'student' && msg.words && msg.words.length > 0 ? (
                  <div className="flex flex-wrap gap-x-2 gap-y-1 justify-end">
                    {(() => {
                      // correction과 비교해서 색상 결정
                      const correctionWords = msg.feedback?.correction
                        ? msg.feedback.correction.toLowerCase().replace(/[.,!?]/g, '').split(' ')
                        : null
                      const originalWords = msg.content.toLowerCase().replace(/[.,!?]/g, '').split(' ')

                      return msg.words.map((w, i) => {
                        let color = 'text-emerald-300'  // 기본: 초록
                        if (correctionWords) {
                          // correction이 있으면 — 원문과 비교
                          const originalWord = originalWords[i] || ''
                          const correctedWord = correctionWords[i] || ''
                          // 해당 위치 단어가 다르거나 correction에 없으면 빨강
                          color = originalWord === correctedWord || !correctedWord
                            ? 'text-emerald-300'
                            : 'text-red-300'
                        }
                        // correction 없으면 전부 초록
                        const displayWord = i === 0
                          ? w.word.charAt(0).toUpperCase() + w.word.slice(1)
                          : w.word
                        return (
                          <span key={i} className={cn('text-sm font-medium', color)}>
                            {displayWord}
                          </span>
                        )
                      })
                    })()}
                  </div>
                ) : msg.role === 'ai' ? (
                  // AI 영어 문장은 기본 숨김 — "영문 보기"를 눌러야 표시, 왼쪽 "다시 듣기"로 재생
                  <EnglishBox
                    text={msg.content}
                    onReplay={() => replayTTS(msg.content)}
                    replayDisabled={isSpeaking}
                  />
                ) : (
                  <span>{msg.content}</span>
                )}
                {/* AI 메시지 — 한국어 번역 버튼 */}
                {msg.role === 'ai' && msg.translation && (
                  <TranslationBox translation={msg.translation} />
                )}
              </div>

                {/* AI 메시지 — 힌트 버튼 */}
                {msg.role === 'ai' && (msg.hintLine || (msg.acceptVariants && msg.acceptVariants.length > 0)) && (
                  <HintBox
                    msgId={msg.id}
                    hintLine={msg.hintLine}
                    acceptVariants={msg.acceptVariants}
                    onHintSeen={(msgId) => setSeenHints(prev => new Set(prev).add(msgId))}
                    alreadySeen={seenHints.has(msg.id)}
                  />
                )}
              {msg.role === 'student' && msg.feedback && settings.show_feedback && (
                <div className="mt-1.5 max-w-[85%] w-full bg-slate-800/60 border border-slate-700/40 rounded-xl px-3 py-2 space-y-1.5">
                  {/* 점수 한 줄 요약 */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      <span>문법 <span className={cn('font-bold font-mono', msg.feedback.grammar >= 80 ? 'text-emerald-400' : msg.feedback.grammar >= 60 ? 'text-amber-400' : 'text-red-400')}>{msg.feedback.grammar}</span></span>
                      <span>유창성 <span className={cn('font-bold font-mono', msg.feedback.fluency >= 80 ? 'text-emerald-400' : msg.feedback.fluency >= 60 ? 'text-amber-400' : 'text-red-400')}>{msg.feedback.fluency}</span></span>
                      <span>어휘 <span className={cn('font-bold font-mono', msg.feedback.vocabulary >= 80 ? 'text-emerald-400' : msg.feedback.vocabulary >= 60 ? 'text-amber-400' : 'text-red-400')}>{msg.feedback.vocabulary}</span></span>
                    </div>
                    <span className={cn(
                      'text-sm font-bold font-mono',
                      msg.feedback.overall >= 80 ? 'text-emerald-400' : msg.feedback.overall >= 60 ? 'text-amber-400' : 'text-red-400'
                    )}>{msg.feedback.overall}</span>
                  </div>
                  {/* 교정 */}
                  {msg.feedback.correction && (
                    <p className="text-xs text-amber-300">
                      <span className="opacity-60">💡 </span>{msg.feedback.correction}
                    </p>
                  )}
                  {/* 팁 */}
                  <p className="text-xs text-emerald-300">
                    <span className="opacity-60">✨ </span>{msg.feedback.tip}
                  </p>
                </div>
              )}
            </div>
          ))}

          {/* 상황 안내 — Coty가 말하기 직전 보여주는 한국어 상황 설명 (새 step 진입 시) */}
          {currentScene && (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-2xl px-4 py-3 max-w-[85%] mr-auto">
              <p className="text-[11px] text-amber-300/70 mb-0.5">
                🎭 상황{currentScene.step > 0 && <span className="ml-1 font-semibold">· Step {currentScene.step}</span>}
              </p>
              <p className="text-sm text-amber-100/90 leading-relaxed">{currentScene.text}</p>
            </div>
          )}

          {/* 실시간 자막 */}
          {(isSpeaking || isHolding || interimText) && (
            <div className="bg-slate-900/60 backdrop-blur-sm border border-slate-700/50 rounded-2xl px-4 py-3 max-w-[85%] mr-auto">
              {isSpeaking ? (
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0,1,2,3].map(i => (
                      <div key={i} className="w-1 bg-violet-400 rounded-full animate-pulse"
                        style={{ height: `${10 + i * 3}px`, animationDelay: `${i * 0.1}s` }} />
                    ))}
                  </div>
                  <p className="text-violet-300 text-xs">말하는 중...</p>
                </div>
              ) : isHolding ? (
                // 마이크 누르고 있는 중 — Coty 듣는 중 메시지
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    {[0,1,2,3].map(i => (
                      <div key={i} className="w-1 bg-emerald-400 rounded-full animate-pulse"
                        style={{ height: `${8 + i * 3}px`, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                  <p className="text-emerald-300 text-sm">Coty가 당신의 말을 듣고 있습니다.</p>
                </div>
              ) : interimWords.length > 0 ? (
                <div className="space-y-1">
                  <WordConfidenceDisplay words={interimWords} />
                  <span className="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full ml-1 animate-pulse align-middle" />
                </div>
              ) : (
                <p className="text-slate-400 text-sm leading-relaxed">
                  {interimText}
                  <span className="inline-block w-1.5 h-1.5 bg-amber-400 rounded-full ml-2 animate-pulse align-middle" />
                </p>
              )}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* ③ 하단 컨트롤 영역 (고정) */}
        <div className="shrink-0 px-4 pb-4 pt-2 space-y-3">

          {/* 진행률 바 — 시나리오가 있으면 표시 */}
          {(activeScenario || progress > 0) && (
            <div className="space-y-1">
              {/* 회차·완료 횟수 (진도율 위) */}
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-400 truncate mr-2">
                  {attemptNumber > 0 && (
                    <span className="text-violet-300 font-semibold">{attemptNumber}번째 진행</span>
                  )}
                </span>
                {completedCount > 0 && (
                  <span className="text-emerald-400 font-semibold shrink-0">✅ 완료 {completedCount}회</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400 truncate mr-2">
                  📚 {activeBook} · Unit {activeUnit}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={cn(
                    'text-xs font-bold tabular-nums transition-colors',
                    progress >= 80 ? 'text-emerald-400' :
                    progress >= 50 ? 'text-amber-400' : 'text-slate-400'
                  )}>
                    {progress}%
                  </span>
                  <button
                    onClick={() => setShowProgress(true)}
                    className="text-sm text-slate-400 hover:text-white transition-colors"
                    title="학습 진행 상황"
                  >
                    📊
                  </button>
                </div>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-700 ease-out',
                    progress >= 80 ? 'bg-emerald-500' :
                    progress >= 50 ? 'bg-amber-500' : 'bg-violet-500'
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* 마이크 버튼 + 재생 버튼 (원본 / 가공본 비교) */}
          <div className="flex items-center justify-center gap-6">
            {/* 원본 녹음 재생 — 필터 거치지 않은 raw 마이크 */}
            <PlaybackButton key={lastBlobUrl ?? 'raw'} url={lastBlobUrl} label="원본" />

            {/* 메인 마이크 버튼 — 크게 */}
            <button
              onMouseDown={(e) => {
                if (isTouchRef.current) return  // 터치 이벤트 후 발생하는 마우스 이벤트 무시
                e.preventDefault()
                handleMicStart()
              }}
              onMouseUp={(e) => {
                if (isTouchRef.current) return
                e.preventDefault()
                handleMicStop()
              }}
              onMouseLeave={(e) => {
                if (isTouchRef.current) return
                if (isHolding) handleMicStop()  // 마우스가 버튼 밖으로 나가면 정지
              }}
              onTouchStart={(e) => {
                e.preventDefault()
                isTouchRef.current = true
                handleMicStart()
              }}
              onTouchEnd={(e) => {
                e.preventDefault()
                handleMicStop()
                // 300ms 후 터치 플래그 해제
                setTimeout(() => { isTouchRef.current = false }, 300)
              }}
              onTouchCancel={(e) => {
                e.preventDefault()
                handleMicStop()
                setTimeout(() => { isTouchRef.current = false }, 300)
              }}
              onContextMenu={(e) => e.preventDefault()}
              disabled={!isSupported || sessionEnded || lessonState !== 'active'}
              className={cn(
                'w-24 h-24 rounded-full flex items-center justify-center text-4xl',
                'transition-all duration-150 shadow-2xl select-none',
                'disabled:opacity-40 disabled:cursor-not-allowed',
                isHolding
                  ? 'bg-gradient-to-br from-emerald-400 to-teal-500 scale-110 shadow-emerald-500/60 ring-4 ring-emerald-400/40'
                  : 'bg-gradient-to-br from-slate-600 to-slate-700 hover:from-slate-500 hover:to-slate-600'
              )}
            >
              {sessionEnded ? '👋' : isHolding ? '🎙️' : '🎤'}
            </button>

            {/* 가공본 재생 — Deepgram에 실제로 전송된 음성 */}
            <PlaybackButton key={lastProcessedBlobUrl ?? 'proc'} url={lastProcessedBlobUrl} label="가공본" accent="bg-violet-600 hover:bg-violet-700" />
          </div>

          <p className={cn('text-xs text-center', sessionEnded ? 'text-emerald-400 font-medium' : 'text-slate-500')}>
            {sessionEnded
              ? '👋 오늘 수업이 끝났어요. 내일 또 만나요!'
              : isHolding ? '손을 떼면 전송됩니다' : '누르고 있는 동안 말하세요 (Push-to-Talk)'}
          </p>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => setShowAudioSettings(true)}
              className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
            >
              🎛️ 오디오 가공 설정
            </button>
            <button
              onClick={() => setShowScenario(true)}
              className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
              title="오늘 수업 시나리오와 AI 지침 보기 (교사용)"
            >
              📋 시나리오 · 지침
            </button>
          </div>

          {saveMessage && (
            <div className={cn(
              'px-4 py-2 rounded-xl text-xs font-mono text-center',
              saveMessage.ok
                ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/50'
                : 'bg-red-900/60 text-red-300 border border-red-700/50'
            )}>
              {saveMessage.text}
            </div>
          )}
        </div>
      </div>

      {/* 설정 모달 */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onUpdate={updateSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* 오디오 가공 설정 모달 */}
      {showAudioSettings && (
        <AudioProcessingModal
          config={audioConfig}
          onApply={setAudioConfig}
          onReset={resetAudioConfig}
          onClose={() => setShowAudioSettings(false)}
        />
      )}

      {/* 학습 진행 상황 모달 */}
      {showProgress && (
        <ProgressModal
          scenario={activeScenario}
          stepProgress={stepProgress}
          book={activeBook}
          unit={activeUnit}
          unitTitle={activeScenario?.title}
          onClose={() => setShowProgress(false)}
        />
      )}

      {/* 시나리오·지침 인스펙터 모달 (교사/운영자용) */}
      {showScenario && (
        <ScenarioInspectorModal
          scenario={activeScenario}
          nickname={studentNickname}
          onClose={() => setShowScenario(false)}
        />
      )}

      {/* 복습/시작 확인 카드 (로그인 직후 · 수업 완료 후) */}
      {lessonState === 'confirm' && (
        <ConfirmStartCard
          book={activeBook}
          unit={activeUnit}
          scenario={activeScenario}
          attemptCount={attemptCount}
          completedCount={completedCount}
          isFirstTime={!hasHistory}
          onStart={() => startAttempt(activeBook, activeUnit)}
          onPick={() => setLessonState('picking')}
          onExit={handleExit}
        />
      )}

      {/* Book·Unit 선택 카드 */}
      {lessonState === 'picking' && (
        <BookUnitPickerCard
          initialBook={activeBook}
          initialUnit={activeUnit}
          onSelect={handlePickUnit}
          onCancel={() => setLessonState('confirm')}
        />
      )}

      {/* 피드백은 대화 버블 인라인으로만 표시 — 오버레이 카드 제거 */}

      {/* 시스템 로그 Drawer */}
      <div className={cn(
        'fixed bottom-0 left-0 right-0 bg-slate-900/95 backdrop-blur-md border-t border-slate-700/50',
        'transition-transform duration-300 z-50 max-h-72 overflow-y-auto',
        isLogDrawerOpen ? 'translate-y-0' : 'translate-y-full'
      )}>
        <div className="p-4 space-y-1 font-mono text-xs">
          <div className="flex items-center justify-between mb-3 sticky top-0 bg-slate-900/95 py-1">
            <span className="text-slate-400">System Log</span>
            <button onClick={() => setLogDrawerOpen(false)} className="text-slate-500 hover:text-white">✕</button>
          </div>
          {logs.length === 0 && <p className="text-slate-600">아직 로그가 없습니다.</p>}
          {logs.map((log) => (
            <div key={log.id} className="flex gap-2">
              <span className="text-slate-600 shrink-0">{log.time}</span>
              <span className={cn(
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
      </div>
    </main>
  )
}
