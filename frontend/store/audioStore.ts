import { create } from 'zustand'
import type { SpeechResult, STTPath, AvatarStatus, WordResult } from '@/types'

export const CONFIDENCE_THRESHOLD = 0.85

interface AudioState {
  isRecording: boolean
  interimText: string
  finalText: string
  lastSpeechResult: SpeechResult | null
  currentPath: STTPath | null
  avatarStatus: AvatarStatus
  lastLatencyMs: number | null
  // 단어별 인식 결과 (실시간)
  interimWords: WordResult[]
  // 최종 단어별 인식 결과
  finalWords: WordResult[]

  setRecording: (isRecording: boolean) => void
  setInterimText: (text: string) => void
  setFinalText: (text: string) => void
  setSpeechResult: (result: SpeechResult) => void
  setAvatarStatus: (status: AvatarStatus) => void
  setLatency: (ms: number) => void
  setInterimWords: (words: WordResult[]) => void
  setFinalWords: (words: WordResult[]) => void
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
  interimWords: [],
  finalWords: [],
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
  setInterimWords: (interimWords) => set({ interimWords }),
  setFinalWords: (finalWords) => set({ finalWords }),
  reset: () => set(initialState),
}))
