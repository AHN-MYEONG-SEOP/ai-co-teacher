import { create } from 'zustand'

// 마이크 입력 가공(노이즈 제거) 파이프라인 설정.
// useWebSpeech가 녹음 시작 시 이 값으로 Web Audio 그래프를 구성한다.
// localStorage에 저장되어 새로고침 후에도 유지된다 (교사/개발자 튜닝용).
export interface AudioProcessingConfig {
  // getUserMedia 브라우저 내장 처리
  echoCancellation: boolean
  noiseSuppression: boolean
  autoGainControl: boolean
  // HighPass: 저주파(웅웅거림) 제거
  highpass: { enabled: boolean; freq: number }
  // LowPass: 고주파(쉭쉭거림) 제거
  lowpass: { enabled: boolean; freq: number }
  // DynamicsCompressor: 소음 억제 + 음량 평탄화
  compressor: {
    enabled: boolean
    threshold: number  // dB
    knee: number       // dB
    ratio: number      // n:1
    attack: number     // sec
    release: number    // sec
  }
}

// 현재 코드의 기본값과 동일 (useWebSpeech 원래 하드코딩 값)
export const DEFAULT_AUDIO_CONFIG: AudioProcessingConfig = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  highpass: { enabled: true, freq: 80 },
  lowpass: { enabled: true, freq: 8000 },
  compressor: {
    enabled: true,
    threshold: -30,
    knee: 10,
    ratio: 8,
    attack: 0.003,
    release: 0.1,
  },
}

const STORAGE_KEY = 'audioProcessingConfig'

interface AudioConfigState {
  config: AudioProcessingConfig
  setConfig: (config: AudioProcessingConfig) => void
  resetConfig: () => void
  hydrate: () => void
}

export const useAudioConfigStore = create<AudioConfigState>((set) => ({
  // SSR/하이드레이션 불일치 방지를 위해 항상 기본값으로 시작하고,
  // 마운트 후 page에서 hydrate()로 localStorage 값을 불러온다.
  config: DEFAULT_AUDIO_CONFIG,

  setConfig: (config) => {
    set({ config })
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config))
    } catch {
      /* localStorage 불가 환경 무시 */
    }
  },

  resetConfig: () => {
    set({ config: DEFAULT_AUDIO_CONFIG })
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  },

  hydrate: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as Partial<AudioProcessingConfig>
      // 스키마 변경 대비: 기본값과 깊은 병합
      set({
        config: {
          ...DEFAULT_AUDIO_CONFIG,
          ...saved,
          highpass: { ...DEFAULT_AUDIO_CONFIG.highpass, ...saved.highpass },
          lowpass: { ...DEFAULT_AUDIO_CONFIG.lowpass, ...saved.lowpass },
          compressor: { ...DEFAULT_AUDIO_CONFIG.compressor, ...saved.compressor },
        },
      })
    } catch {
      /* 파싱 실패 시 기본값 유지 */
    }
  },
}))
