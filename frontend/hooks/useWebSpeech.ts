'use client'

import { useCallback, useRef, useState } from 'react'
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
  const isStoppingRef = useRef(false)       // 정지 요청 플래그
  const finalizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 최종 결과 처리 (공통)
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

    if (!fullText) return

    onLog?.(`최종 전송: "${fullText}" (avg conf: ${avgConfidence.toFixed(2)})`)
    if (avgConfidence >= CONFIDENCE_THRESHOLD) {
      onLog?.(`✅ Path A: avg conf ${avgConfidence.toFixed(2)} >= ${CONFIDENCE_THRESHOLD}`)
      onFinalResult?.(fullText, avgConfidence)
    } else {
      onLog?.(`⚠️ Path B: avg conf ${avgConfidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD}`)
      onFallback?.(avgConfidence)
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
  }, [onFinalResult, onFallback, onLog])

  const startListening = useCallback(async () => {
    accumulatedTextRef.current = ''
    accumulatedConfidenceRef.current = []
    isStoppingRef.current = false

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

      onStreamReady?.(stream)

      const tokenRes = await fetch('/api/deepgram-token')
      if (!tokenRes.ok) { onError?.('Deepgram 토큰 발급 실패'); return }
      const { token } = await tokenRes.json()

      const wsUrl = 'wss://api.deepgram.com/v1/listen?' +
        new URLSearchParams({
          language: 'en-US',
          model: 'nova-2',
          smart_format: 'true',
          interim_results: 'true',
          punctuate: 'true',
          utterance_end_ms: '1000',  // 1초 침묵 후 발화 종료 감지
          vad_events: 'true',        // 음성 감지 이벤트
        }).toString()

      onLog?.('Deepgram WebSocket 연결 시도...')
      const ws = new WebSocket(wsUrl, ['token', token])

      ws.onopen = () => {
        onLog?.('✅ Deepgram WebSocket 연결 성공!')
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
        onLog?.('녹음 시작')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          // UtteranceEnd: 발화가 끝났고 정지 요청이 있으면 바로 finalize
          if (data.type === 'UtteranceEnd') {
            onLog?.('UtteranceEnd 감지')
            if (isStoppingRef.current) {
              finalize()
            }
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
            onInterimResult?.(display)
          } else {
            accumulatedTextRef.current = accumulatedTextRef.current
              ? `${accumulatedTextRef.current} ${transcript}`
              : transcript
            accumulatedConfidenceRef.current.push(confidence)
            onLog?.(`누적: "${accumulatedTextRef.current}"`)
            onInterimResult?.(accumulatedTextRef.current)

            // 정지 요청 중이면 is_final 받은 후 finalize 타이머 시작
            if (isStoppingRef.current) {
              if (finalizeTimerRef.current) clearTimeout(finalizeTimerRef.current)
              finalizeTimerRef.current = setTimeout(finalize, 600)
            }
          }
        } catch { }
      }

      ws.onerror = () => {
        onLog?.('❌ Deepgram WebSocket 오류')
        onError?.('Deepgram 연결 오류')
        setIsListening(false)
      }
      ws.onclose = (e) => {
        onLog?.(`Deepgram 연결 종료: code=${e.code}`)
        setIsListening(false)
      }
      wsRef.current = ws

    } catch (err) {
      onLog?.(`❌ 마이크 접근 실패: ${err}`)
      onError?.(`마이크 접근 실패: ${err}`)
      setIsListening(false)
    }
  }, [onInterimResult, onFinalResult, onFallback, onError, onLog, onStreamReady, finalize])

  const stopListening = useCallback(() => {
    onLog?.('stopListening 호출 — 마지막 응답 대기 중...')
    isStoppingRef.current = true

    // MediaRecorder 정지 (Deepgram에 남은 오디오 전송)
    if (mrRef.current?.state === 'recording') {
      mrRef.current.stop()
    }

    // UtteranceEnd나 is_final을 못 받을 경우를 대비한 안전장치 (1.5초 후 강제 finalize)
    finalizeTimerRef.current = setTimeout(() => {
      onLog?.('안전장치: 1.5초 후 강제 finalize')
      finalize()
    }, 1500)
  }, [onLog, finalize])

  return { isSupported, isListening, startListening, stopListening }
}
