'use client'

import { useEffect, useRef } from 'react'

export type CotyState = 'idle' | 'speaking' | 'listening' | 'processing' | 'correct' | 'encourage' | 'think'

interface CotyAvatarProps {
  state: CotyState
}

export function CotyAvatar({ state }: CotyAvatarProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const prevStateRef = useRef<CotyState>('idle')

  const videoMap: Record<CotyState, string> = {
    idle:       '/avatars/coty/coty-idle.mp4',
    speaking:   '/avatars/coty/coty-speaking.mp4',
    listening:  '/avatars/coty/coty-think.mp4',
    processing: '/avatars/coty/coty-think.mp4',
    correct:    '/avatars/coty/coty-correct.mp4',
    encourage:  '/avatars/coty/coty-encourage.mp4',
    think:      '/avatars/coty/coty-think.mp4',
  }

  const oneShot = new Set<CotyState>(['correct', 'encourage'])

  const labelMap: Record<CotyState, string> = {
    idle:       '대기 중',
    speaking:   '말하는 중...',
    listening:  '듣는 중...',
    processing: '생각하는 중...',
    correct:    '잘했어요! 🎉',
    encourage:  '다시 해봐요 💪',
    think:      '힌트 줄게요 💡',
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (prevStateRef.current === state) return
    prevStateRef.current = state

    video.style.opacity = '0'
    setTimeout(() => {
      video.src = videoMap[state]
      video.loop = !oneShot.has(state)
      video.load()
      video.play().catch(() => {})
      video.style.opacity = '1'
    }, 200)

    if (oneShot.has(state)) {
      const handleEnded = () => {
        prevStateRef.current = 'idle'
        video.src = videoMap['idle']
        video.loop = true
        video.load()
        video.play().catch(() => {})
        video.style.opacity = '1'
      }
      video.addEventListener('ended', handleEnded, { once: true })
    }
  }, [state])

  return (
    <div className="hidden lg:flex flex-col items-center justify-center w-[420px] shrink-0 border-r border-slate-800 bg-slate-950 px-4 py-6 gap-3">
      <div className="text-xs text-pink-400 font-medium tracking-wide">✨ Coty 선생님</div>
      <div className="relative w-full max-w-[180px] lg:max-w-[360px]">
        <video
          ref={videoRef}
          src="/avatars/coty/coty-idle.mp4"
          autoPlay
          loop
          muted
          playsInline
          className="w-full rounded-2xl shadow-2xl"
          style={{
            aspectRatio: '3/4',
            maxHeight: '480px',
            objectFit: 'cover',
            transition: 'opacity 0.2s ease-in-out',
          }}
        />
        {state === 'speaking' && (
          <div className="absolute inset-0 rounded-2xl ring-2 ring-pink-400/60 animate-pulse" />
        )}
        {state === 'correct' && (
          <div className="absolute inset-0 rounded-2xl ring-2 ring-yellow-400/70 animate-pulse" />
        )}
      </div>
      <p className="text-xs text-slate-400 text-center">{labelMap[state]}</p>
    </div>
  )
}
