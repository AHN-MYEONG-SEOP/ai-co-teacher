'use client'

import { useCallback, useRef, useState } from 'react'
import { CONFIDENCE_THRESHOLD } from '@/store/audioStore'
import type { WordResult } from '@/types'

interface DeepgramOptions {
  onInterimResult?: (text: string, words?: WordResult[]) => void
  onFinalResult?: (text: string, confidence: number, words?: WordResult[]) => void
  onFallback?: (confidence: number) => void
  onError?: (error: string) => void
  onLog?: (msg: string) => void
  onStreamReady?: (stream: MediaStream) => void
}

export function useWebSpeech({
  onFinalResult,
  onFallback,
  onError,
  onLog,
  onStreamReady,
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

  const startListening = useCallback(async () => {
    chunksRef.current = []

    try {
      onLogRef.current?.('마이크 스트림 요청 중...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        }
      })
      streamRef.current = stream
      onLogRef.current?.('마이크 스트림 획득 성공')

      // 스트림을 MediaRecorder와 공유
      onStreamReadyRef.current?.(stream)

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'

      const mr = new MediaRecorder(stream, { mimeType })
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
      onLogRef.current?.('녹음 데이터 없음')
      return
    }

    const mimeType = mrRef.current?.mimeType || 'audio/webm'
    const blob = new Blob(chunks, { type: mimeType })
    chunksRef.current = []

    onLogRef.current?.(`Deepgram 전송 중... (${(blob.size / 1024).toFixed(1)}KB)`)

    try {
      // 서버에서 토큰 발급
      const tokenRes = await fetch('/api/deepgram-token')
      if (!tokenRes.ok) { onErrorRef.current?.('Deepgram 토큰 발급 실패'); return }
      const { token } = await tokenRes.json()

      // Deepgram HTTP API로 전송
      const params = new URLSearchParams({
        language: 'multi',
        model: 'nova-2',
        smart_format: 'true',
        punctuate: 'true',
        utterances: 'true',
      })

      const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': mimeType,
        },
        body: blob,
      })

      if (!res.ok) {
        onErrorRef.current?.(`Deepgram API 오류: ${res.status}`)
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

      if (confidence >= CONFIDENCE_THRESHOLD) {
        onLogRef.current?.('✅ Path A')
        onFinalResultRef.current?.(transcript, confidence, words)
      } else {
        onLogRef.current?.('⚠️ Path B')
        onFallbackRef.current?.(confidence)
      }

    } catch (err) {
      onLogRef.current?.(`❌ Deepgram 오류: ${err}`)
      onErrorRef.current?.(`Deepgram 오류: ${err}`)
    }
  }, [])

  return { isSupported, isListening, startListening, stopListening }
}
