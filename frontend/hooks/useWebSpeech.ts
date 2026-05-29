'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CONFIDENCE_THRESHOLD } from '@/store/audioStore'

interface DeepgramOptions {
  onInterimResult?: (text: string) => void
  onFinalResult?: (text: string, confidence: number) => void
  onFallback?: (confidence: number) => void
  onError?: (error: string) => void
  onLog?: (msg: string) => void
  onStreamReady?: (stream: MediaStream) => void
}

export function useWebSpeech({
  onInterimResult,
  onFinalResult,
  onFallback,
  onError,
  onLog,
  onStreamReady,
}: DeepgramOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const mrRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isListening, setIsListening] = useState(false)
  const isSupported = true

  const accumulatedTextRef = useRef<string>('')
  const accumulatedConfidenceRef = useRef<number[]>([])
  const isStoppingRef = useRef(false)
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 콜백들을 ref로 저장 — 클로저 안에서 항상 최신 버전 참조
  const onFinalResultRef = useRef(onFinalResult)
  const onFallbackRef = useRef(onFallback)
  const onLogRef = useRef(onLog)
  const onInterimResultRef = useRef(onInterimResult)
  const onErrorRef = useRef(onError)
  const onStreamReadyRef = useRef(onStreamReady)

  useEffect(() => { onFinalResultRef.current = onFinalResult }, [onFinalResult])
  useEffect(() => { onFallbackRef.current = onFallback }, [onFallback])
  useEffect(() => { onLogRef.current = onLog }, [onLog])
  useEffect(() => { onInterimResultRef.current = onInterimResult }, [onInterimResult])
  useEffect(() => { onErrorRef.current = onError }, [onError])
  useEffect(() => { onStreamReadyRef.current = onStreamReady }, [onStreamReady])

  // finalize — ref 사용으로 항상 최신 콜백 호출
  const finalize = useCallback(() => {
    if (finalizeTimerRef.current) {
      clearTimeout(finalizeTimerRef.current)
      finalizeTimerRef.current = null
    }

    const fullText = accumulatedTextRef.current.trim()
    const confidences = accumulatedConfidenceRef.current
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 1.0

    accumulatedTextRef.current = ''
    accumulatedConfidenceRef.current = []
    isStoppingRef.current = false

    if (!fullText) {
      onLogRef.current?.('finalize: 텍스트 없음 — 무시')
      return
    }

    onLogRef.current?.(`최종 전송: "${fullText}" (avg conf: ${avgConfidence.toFixed(2)})`)

    if (avgConfidence >= CONFIDENCE_THRESHOLD) {
      onLogRef.current?.(`✅ Path A`)
      onFinalResultRef.current?.(fullText, avgConfidence)
    } else {
      onLogRef.current?.(`⚠️ Path B`)
      onFallbackRef.current?.(avgConfidence)
    }

    // WebSocket + 스트림 종료
    setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'CloseStream' }))
        wsRef.current.close()
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      setIsListening(false)
    }, 300)
  }, []) // 의존성 없음 — ref로만 접근

  const startListening = useCallback(async () => {
    accumulatedTextRef.current = ''
    accumulatedConfidenceRef.current = []
    isStoppingRef.current = false

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
      onStreamReadyRef.current?.(stream)

      // 토큰 발급
      const tokenRes = await fetch('/api/deepgram-token')
      if (!tokenRes.ok) { onErrorRef.current?.('Deepgram 토큰 발급 실패'); return }
      const { token } = await tokenRes.json()
      onLogRef.current?.('토큰 발급 완료')

      const wsUrl = 'wss://api.deepgram.com/v1/listen?' +
        new URLSearchParams({
          language: 'en-US',
          model: 'nova-2',
          smart_format: 'true',
          interim_results: 'true',
          punctuate: 'true',
          utterance_end_ms: '2000',
          vad_events: 'true',
        }).toString()

      onLogRef.current?.('Deepgram WebSocket 연결 시도...')
      const ws = new WebSocket(wsUrl, ['token', token])

      ws.onopen = () => {
        onLogRef.current?.('✅ Deepgram WebSocket 연결 성공!')

        // 연결 완료 후 MediaRecorder 시작 (단일 스트림, 프리버퍼 없음)
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
        const mr = new MediaRecorder(stream, { mimeType })
        mr.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data)
        }
        mr.start(100)
        mrRef.current = mr
        setIsListening(true)
        onLogRef.current?.('녹음 + 스트리밍 시작')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'UtteranceEnd') {
            onLogRef.current?.('UtteranceEnd 감지')
            if (isStoppingRef.current) finalize()
            return
          }

          if (!data.channel) return
          const transcript = data.channel.alternatives?.[0]?.transcript || ''
          const confidence = data.channel.alternatives?.[0]?.confidence ?? 1.0
          const isFinal = data.is_final

          if (!transcript) return

          if (!isFinal) {
            const display = accumulatedTextRef.current
              ? `${accumulatedTextRef.current} ${transcript}`
              : transcript
            onInterimResultRef.current?.(display)
          } else {
            accumulatedTextRef.current = accumulatedTextRef.current
              ? `${accumulatedTextRef.current} ${transcript}`
              : transcript
            accumulatedConfidenceRef.current.push(confidence)
            onLogRef.current?.(`누적: "${accumulatedTextRef.current}"`)
            onInterimResultRef.current?.(accumulatedTextRef.current)

            if (isStoppingRef.current) {
              if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current)
              finalizeTimerRef.current = setTimeout(finalize, 600)
            }
          }
        } catch { }
      }

      ws.onerror = () => {
        onLogRef.current?.('❌ Deepgram WebSocket 오류')
        onErrorRef.current?.('Deepgram 연결 오류')
        setIsListening(false)
      }
      ws.onclose = (e) => {
        onLogRef.current?.(`Deepgram 연결 종료: code=${e.code}`)
        setIsListening(false)
        // 예상치 못한 종료 시 누적된 텍스트 처리
        if (accumulatedTextRef.current.trim()) {
          onLogRef.current?.('예상치 못한 종료 — 누적 텍스트 finalize')
          finalize()
        }
      }
      wsRef.current = ws

    } catch (err) {
      onLogRef.current?.(`❌ 마이크 접근 실패: ${err}`)
      onErrorRef.current?.(`마이크 접근 실패: ${err}`)
      setIsListening(false)
    }
  }, [finalize])

  const stopListening = useCallback(() => {
    onLogRef.current?.('stopListening 호출 — 마지막 응답 대기 중...')
    isStoppingRef.current = true

    if (mrRef.current?.state === 'recording') {
      mrRef.current.stop()
    }

    // 안전장치: 1.5초 후 강제 finalize
    finalizeTimerRef.current = setTimeout(() => {
      onLogRef.current?.('안전장치: 강제 finalize')
      finalize()
    }, 1500)
  }, [finalize])

  return { isSupported, isListening, startListening, stopListening }
}
