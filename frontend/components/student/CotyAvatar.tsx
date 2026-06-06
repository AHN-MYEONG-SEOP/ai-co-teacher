'use client'

import { useEffect, useRef } from 'react'

export type CotyState = 'idle' | 'speaking' | 'listening' | 'processing' | 'correct' | 'encourage' | 'think'

interface CotyAvatarProps {
  state: CotyState
}

function SoundWave() {
  const bars = Array.from({ length: 20 }, (_, i) => ({
    height: Math.floor(Math.random() * 28) + 6,
    delay: (i * 0.04).toFixed(2),
  }))

  return (
    <div className="flex items-end justify-center gap-[3px] h-[40px] mt-3">
      {bars.map((bar, i) => (
        <div
          key={i}
          className="w-[4px] rounded-full bg-pink-400"
          style={{
            height: `${bar.height}px`,
            animation: `cotyWave 0.5s ease-in-out infinite alternate`,
            animationDelay: `${bar.delay}s`,
          }}
        />
      ))}
      <style>{`
        @keyframes cotyWave {
          from { transform: scaleY(0.2); opacity: 0.5; }
          to   { transform: scaleY(1);   opacity: 1;   }
        }
      `}</style>
    </div>
  )
}

export function CotyAvatar({ state }: CotyAvatarProps) {
  const imageMap: Record<CotyState, string> = {
    idle:       '/coty-idle.jpg',
    speaking:   '/coty-idle.jpg',
    listening:  '/coty-think.jpg',
    processing: '/coty-think.jpg',
    correct:    '/coty-correct.jpg',
    encourage:  '/coty-encourage.jpg',
    think:      '/coty-think.jpg',
  }

  const labelMap: Record<CotyState, string> = {
    idle:       '대기 중',
    speaking:   '말하는 중...',
    listening:  '듣는 중...',
    processing: '생각하는 중...',
    correct:    '잘했어요! 🎉',
    encourage:  '다시 해봐요 💪',
    think:      '힌트 줄게요 💡',
  }

  return (
    <div className="hidden lg:flex flex-col items-center justify-center w-[280px] shrink-0 border-r border-slate-800 bg-slate-950 px-4 py-6 gap-3">
      {/* 이름 배지 */}
      <div className="text-xs text-pink-400 font-medium tracking-wide">✨ Coty 선생님</div>

      {/* 아바타 이미지 */}
      <div className="relative w-full max-w-[220px]">
        <img
          src={imageMap[state]}
          alt="Coty 선생님"
          className="w-full rounded-2xl object-cover object-top shadow-2xl"
          style={{ aspectRatio: '3/4', maxHeight: '320px', objectFit: 'cover' }}
        />
        {/* speaking 상태일 때 테두리 반짝 */}
        {state === 'speaking' && (
          <div className="absolute inset-0 rounded-2xl ring-2 ring-pink-400/60 animate-pulse" />
        )}
        {/* correct 상태일 때 금색 테두리 */}
        {state === 'correct' && (
          <div className="absolute inset-0 rounded-2xl ring-2 ring-yellow-400/70 animate-pulse" />
        )}
      </div>

      {/* 음파 (말하는 중일 때만) */}
      {state === 'speaking' && <SoundWave />}

      {/* 상태 라벨 */}
      <p className="text-xs text-slate-400 text-center">{labelMap[state]}</p>
    </div>
  )
}
