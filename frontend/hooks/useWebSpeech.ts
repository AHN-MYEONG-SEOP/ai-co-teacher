'use client'

import { useCallback, useRef, useState } from 'react'
import { CONFIDENCE_THRESHOLD } from '@/store/audioStore'

interface DeepgramOptions {
  onInterimResult?: (text: string) => void
  onFinalResult?: (text: string, confidence: number) => void
  onFallback?: (confidence: number) => void
  onError?: (error: string) => void
  onLog?: (msg: string) => void
  onStreamReady?: (stream: MediaStream) => void  // 스트림 공유 콜백
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

  const startListening = useCallback(async () => {
    accumulatedTextRef.current = ''
    accumulatedConfidenceRef.current = []

    try {
      onLog?.('마이크 스트림 요청 중...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        }
      })
      streamRef.current = stream
      onLog?.('마이크 스트림 획득 성공')

      // 스트림을 MediaRecorder와 공유 (마이크 중복 열기 방지)
      onStreamReady?.(stream)

      const tokenRes = await fetch('/api/deepgram-token')
      if (!tokenRes.ok) { onError?.('Deepgram 토큰 발급 실패'); return }
      const { token } = await tokenRes.json()

      const wsUrl = 'wss://api.deepgram.com/v1/listen?' +
        new URLSearchParams({
          language: 'en-US', model: 'nova-2',
          smart_format: 'true', interim_results: 'true', punctuate: 'true',
        }).toString()

      onLog?.('Deepgram WebSocket 연결 시도...')
      const ws = new WebSocket(wsUrl, ['token', token])

      ws.onopen = () => {
        onLog?.('✅ Deepgram WebSocket 연결 성공!')
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
        onLog?.(`MediaRecorder mimeType: ${mimeType}`)
        const mr = new MediaRecorder(stream, { mimeType })
        mr.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data)
        }
        mr.start(100)
        mrRef.current = mr
        setIsListening(true)
        onLog?.('MediaRecorder 시작 완료 — 오디오 스트리밍 중')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (!data.channel) return
          const transcript = data.channel.alternatives?.[0]?.transcript || ''
          const confidence = data.channel.alternatives?.[0]?.confidence ?? 1.0
          const isFinal = data.is_final
          if (!transcript) return
          if (!isFinal) {
            const display = accumulatedTextRef.current
              ? `${accumulatedTextRef.current} ${transcript}`
              : transcript
            onInterimResult?.(display)
          } else {
            accumulatedTextRef.current = accumulatedTextRef.current
              ? `${accumulatedTextRef.current} ${transcript}`
              : transcript
            accumulatedConfidenceRef.current.push(confidence)
            onLog?.(`누적: "${accumulatedTextRef.current}" (conf: ${confidence.toFixed(2)})`)
            onInterimResult?.(accumulatedTextRef.current)
          }
        } catch { }
      }

      ws.onerror = () => { onLog?.('❌ Deepgram WebSocket 오류'); onError?.('Deepgram 연결 오류'); setIsListening(false) }
      ws.onclose = (e) => { onLog?.(`Deepgram 연결 종료: code=${e.code}`); setIsListening(false) }
      wsRef.current = ws

    } catch (err) {
      onLog?.(`❌ 마이크 접근 실패: ${err}`)
      onError?.(`마이크 접근 실패: ${err}`)
      setIsListening(false)
    }
  }, [onInterimResult, onFinalResult, onFallback, onError, onLog, onStreamReady])

  const stopListening = useCallback(() => {
    onLog?.('stopListening 호출')
    const fullText = accumulatedTextRef.current.trim()
    const confidences = accumulatedConfidenceRef.current
    const avgConfidence = confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 1.0

    if (fullText) {
      onLog?.(`최종 전송: "${fullText}" (avg conf: ${avgConfidence.toFixed(2)})`)
      if (avgConfidence >= CONFIDENCE_THRESHOLD) {
        onLog?.(`✅ Path A: avg conf ${avgConfidence.toFixed(2)} >= ${CONFIDENCE_THRESHOLD}`)
        onFinalResult?.(fullText, avgConfidence)
      } else {
        onLog?.(`⚠️ Path B: avg conf ${avgConfidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD}`)
        onFallback?.(avgConfidence)
      }
    }

    accumulatedTextRef.current = ''
    accumulatedConfidenceRef.current = []

    if (mrRef.current?.state === 'recording') mrRef.current.stop()
    setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'CloseStream' }))
        wsRef.current.close()
      }
      // 스트림 종료는 여기서 담당 (useMediaRecorder가 스트림을 소유하지 않으므로)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      setIsListening(false)
    }, 500)
  }, [onFinalResult, onFallback, onLog])

  return { isSupported, isListening, startListening, stopListening }
}
