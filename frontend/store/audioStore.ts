import { create } from 'zustand'
import type { SpeechResult, STTPath, AvatarStatus } from '@/types'

export const CONFIDENCE_THRESHOLD = 0.99

interface AudioState {
  // 녹음 상태
  isRecording: boolean
  // 실시간 자막 (Web Speech API 중간 결과)
  interimText: string
  // 최종 확정 텍스트
  finalText: string
  // 마지막 STT 결과
  lastSpeechResult: SpeechResult | null
  // 현재 STT 경로 (A or B)
  currentPath: STTPath | null
  // 아바타 상태
  avatarStatus: AvatarStatus
  // 마지막 처리 지연시간 (ms)
  lastLatencyMs: number | null

  // Actions
  setRecording: (isRecording: boolean) => void
  setInterimText: (text: string) => void
  setFinalText: (text: string) => void
  setSpeechResult: (result: SpeechResult) => void
  setAvatarStatus: (status: AvatarStatus) => void
  setLatency: (ms: number) => void
  reset: () => void
}

const initialState = {
  isRecording: false,
  interimText: '',
  finalText: '',
  lastSpeechResult: null,
  currentPath: null,
  avatarStatus: 'idle' as AvatarStatus,
  lastLatencyMs: null,
}

export const useAudioStore = create<AudioState>((set) => ({
  ...initialState,

  setRecording: (isRecording) => set({ isRecording }),
  setInterimText: (interimText) => set({ interimText }),
  setFinalText: (finalText) => set({ finalText }),
  setSpeechResult: (result) =>
    set({
      lastSpeechResult: result,
      currentPath: result.path,
      finalText: result.text,
      interimText: '',
    }),
  setAvatarStatus: (avatarStatus) => set({ avatarStatus }),
  setLatency: (lastLatencyMs) => set({ lastLatencyMs }),
  reset: () => set(initialState),
}))
