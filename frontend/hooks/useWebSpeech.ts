'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CONFIDENCE_THRESHOLD } from '@/store/audioStore'
import type { WordResult } from '@/types'

interface DeepgramOptions {
  onInterimResult?: (text: string, words?: WordResult[]) => void
  onFinalResult?: (text: string, confidence: number, words?: WordResult[]) => void
  onFallback?: (confidence: number, partialText?: string) => void
  onError?: (error: string) => void
  onLog?: (msg: string) => void
  onStreamReady?: (stream: MediaStream) => void
  confidenceThreshold?: number
}

export function useWebSpeech({
  onFinalResult,
  onFallback,
  onError,
  onLog,
  onStreamReady,
  confidenceThreshold = CONFIDENCE_THRESHOLD,
}: DeepgramOptions) {
  const mrRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [isListening, setIsListening] = useState(false)
  const isSupported = true

  // 콜백 ref
  const onFinalResultRef = useRef(onFinalResult)
  const onFallbackRef = useRef(onFallback)
  const onLogRef = useRef(onLog)
  const onErrorRef = useRef(onError)
  const onStreamReadyRef = useRef(onStreamReady)
  const confidenceThresholdRef = useRef(confidenceThreshold)

  // ref 동기화
  useEffect(() => { onFinalResultRef.current = onFinalResult }, [onFinalResult])
  useEffect(() => { onFallbackRef.current = onFallback }, [onFallback])
  useEffect(() => { onLogRef.current = onLog }, [onLog])
  useEffect(() => { onErrorRef.current = onError }, [onError])
  useEffect(() => { onStreamReadyRef.current = onStreamReady }, [onStreamReady])
  useEffect(() => { confidenceThresholdRef.current = confidenceThreshold }, [confidenceThreshold])

  const startListening = useCallback(async () => {
    chunksRef.current = []

    try {
      onLogRef.current?.('마이크 스트림 요청 중...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          // sampleRate 강제 지정 제거 — 기기 기본값 사용 (스마트폰 호환성)
        }
      })
      streamRef.current = stream
      onLogRef.current?.('마이크 스트림 획득 성공')

      // Web Audio API 노이즈 제거 파이프라인
      let processedStream = stream
      try {
        const audioCtx = new AudioContext({ sampleRate: 16000 })
        const source = audioCtx.createMediaStreamSource(stream)

        // 1. DynamicsCompressor — 소리 크기 압축 (큰 소음 억제)
        const compressor = audioCtx.createDynamicsCompressor()
        compressor.threshold.value = -30   // -30dB 이상만 압축
        compressor.knee.value = 10
        compressor.ratio.value = 8         // 8:1 압축비
        compressor.attack.value = 0.003
        compressor.release.value = 0.1

        // 2. BiquadFilter — 고주파 소음 제거 (에어컨, 팬 소리 등)
        const highPassFilter = audioCtx.createBiquadFilter()
        highPassFilter.type = 'highpass'
        highPassFilter.frequency.value = 80  // 80Hz 이하 저주파 제거

        // 3. BiquadFilter — 저주파 험 제거
        const lowPassFilter = audioCtx.createBiquadFilter()
        lowPassFilter.type = 'lowpass'
        lowPassFilter.frequency.value = 8000  // 8kHz 이상 고주파 제거

        // 파이프라인 연결: source → highpass → lowpass → compressor → destination
        const destination = audioCtx.createMediaStreamDestination()
        source.connect(highPassFilter)
        highPassFilter.connect(lowPassFilter)
        lowPassFilter.connect(compressor)
        compressor.connect(destination)

        processedStream = destination.stream
        onLogRef.current?.('Web Audio 노이즈 제거 파이프라인 적용')
      } catch (audioErr) {
        onLogRef.current?.(`Web Audio 파이프라인 실패 — 원본 스트림 사용: ${audioErr}`)
        processedStream = stream
      }

      // 스트림을 MediaRecorder와 공유 (재생용)
      onStreamReadyRef.current?.(stream)  // 재생용은 원본 스트림

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'

      // 녹음은 처리된 스트림 사용
      const mr = new MediaRecorder(processedStream, { mimeType })
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mr.start(100)
      mrRef.current = mr
      setIsListening(true)
      onLogRef.current?.('녹음 시작 — 말씀하세요')

    } catch (err) {
      onLogRef.current?.(`❌ 마이크 접근 실패: ${err}`)
      onErrorRef.current?.(`마이크 접근 실패: ${err}`)
      setIsListening(false)
    }
  }, [])

  const stopListening = useCallback(async () => {
    onLogRef.current?.('녹음 종료 — Deepgram 전송 중...')
    setIsListening(false)

    // MediaRecorder 정지 후 Blob 수집
    await new Promise<void>((resolve) => {
      if (!mrRef.current || mrRef.current.state === 'inactive') {
        resolve()
        return
      }
      mrRef.current.onstop = () => resolve()
      mrRef.current.stop()
    })

    // 스트림 종료
    streamRef.current?.getTracks().forEach((t) => t.stop())

    const chunks = chunksRef.current
    if (chunks.length === 0) {
      onLogRef.current?.('녹음 데이터 없음 — 재시도 요청')
      onFallbackRef.current?.(0)
      return
    }

    const mimeType = mrRef.current?.mimeType || 'audio/webm'
    const blob = new Blob(chunks, { type: mimeType })
    chunksRef.current = []

    onLogRef.current?.(`Deepgram 전송 중... (${(blob.size / 1024).toFixed(1)}KB)`)

    try {
      // 30초 타임아웃 설정 (긴 발화 대응)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
        onLogRef.current?.('⏱️ Deepgram 타임아웃 — 재시도 요청')
      }, 30000)

      // 서버에서 토큰 발급
      const tokenRes = await fetch('/api/deepgram-token', { signal: controller.signal })
      if (!tokenRes.ok) {
        clearTimeout(timeoutId)
        onFallbackRef.current?.(0)
        return
      }
      const { token } = await tokenRes.json()

      // Deepgram HTTP API로 전송
      const params = new URLSearchParams({
        language: 'multi',
        model: 'nova-2',
        smart_format: 'true',
        punctuate: 'true',
        utterances: 'true',
        filler_words: 'false',
        profanity_filter: 'false',
      })

      const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': mimeType,
        },
        body: blob,
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        onLogRef.current?.(`Deepgram API 오류: ${res.status} — 재시도 요청`)
        onFallbackRef.current?.(0)
        return
      }

      const data = await res.json()
      const channel = data.results?.channels?.[0]
      const alternative = channel?.alternatives?.[0]

      if (!alternative) {
        onLogRef.current?.('인식 결과 없음')
        onFallbackRef.current?.(0)
        return
      }

      const transcript = alternative.transcript || ''
      const confidence = alternative.confidence ?? 1.0
      const words: WordResult[] = (alternative.words || []).map((w: {
        word: string
        confidence: number
        start: number
        end: number
      }) => ({
        word: w.word,
        confidence: w.confidence,
        start: w.start,
        end: w.end,
      }))

      onLogRef.current?.(`인식 완료: "${transcript}" (conf: ${confidence.toFixed(2)})`)

      if (!transcript.trim()) {
        onLogRef.current?.('빈 텍스트 — 재시도 요청')
        onFallbackRef.current?.(0)
        return
      }

      if (confidence >= confidenceThresholdRef.current) {
        onLogRef.current?.('✅ Path A')
        onFinalResultRef.current?.(transcript, confidence, words)
      } else {
        onLogRef.current?.('⚠️ Path B — 부분 인식 텍스트 전달')
        onFallbackRef.current?.(confidence, transcript)  // 텍스트도 전달
      }

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        onLogRef.current?.('⏱️ 타임아웃 — 재시도 요청')
      } else {
        onLogRef.current?.(`❌ Deepgram 오류: ${err}`)
      }
      onFallbackRef.current?.(0)  // 항상 fallback으로 처리 → 재시도 안내
    }
  }, [])

  return { isSupported, isListening, startListening, stopListening }
}
