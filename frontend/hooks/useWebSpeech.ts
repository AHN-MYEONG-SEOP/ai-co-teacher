'use client'

import { useCallback, useRef, useState } from 'react'
import { CONFIDENCE_THRESHOLD } from '@/store/audioStore'

interface DeepgramOptions {
  onInterimResult?: (text: string) => void
  onFinalResult?: (text: string, confidence: number) => void
  onFallback?: (confidence: number) => void
  onError?: (error: string) => void
  onLog?: (msg: string) => void
}

export function useWebSpeech({
  onInterimResult,
  onFinalResult,
  onFallback,
  onError,
  onLog,
}: DeepgramOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const mrRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const [isListening, setIsListening] = useState(false)
  const isSupported = true

  const startListening = useCallback(async () => {
    const apiKey = process.env.NEXT_PUBLIC_DEEPGRAM_API_KEY
    if (!apiKey) {
      onError?.('Deepgram API 키 없음')
      return
    }

    try {
      onLog?.('마이크 스트림 요청 중...')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      onLog?.('마이크 스트림 획득 성공')

      // encoding 파라미터 제거 → Deepgram 자동 감지
      const wsUrl = 'wss://api.deepgram.com/v1/listen?' +
        new URLSearchParams({
          language: 'en-US',
          model: 'nova-2',
          smart_format: 'true',
          interim_results: 'true',
          punctuate: 'true',
        }).toString()

      onLog?.('Deepgram WebSocket 연결 시도...')
      const ws = new WebSocket(wsUrl, ['token', apiKey])

      ws.onopen = () => {
        onLog?.('✅ Deepgram WebSocket 연결 성공!')

        // 지원되는 mimeType 선택
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm')
            ? 'audio/webm'
            : 'audio/mp4'

        onLog?.(`MediaRecorder mimeType: ${mimeType}`)

        const mr = new MediaRecorder(stream, { mimeType })
        mr.ondataavailable = (e) => {
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(e.data)
          }
        }
        mr.start(100) // 100ms 청크 — 더 빠른 데이터 전송
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

          if (transcript) {
            onLog?.(`Deepgram: "${transcript}" | final=${isFinal} | conf=${confidence.toFixed(2)}`)
          }

          if (!transcript) return

          if (!isFinal) {
            onInterimResult?.(transcript)
          } else {
            if (confidence >= CONFIDENCE_THRESHOLD) {
              onLog?.(`✅ Path A: conf ${confidence.toFixed(2)} >= ${CONFIDENCE_THRESHOLD}`)
              onFinalResult?.(transcript, confidence)
            } else {
              onLog?.(`⚠️ Path B: conf ${confidence.toFixed(2)} < ${CONFIDENCE_THRESHOLD}`)
              onFallback?.(confidence)
            }
          }
        } catch {
          // JSON 파싱 오류 무시
        }
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
  }, [onInterimResult, onFinalResult, onFallback, onError, onLog])

  const stopListening = useCallback(() => {
    onLog?.('stopListening 호출')

    // MediaRecorder 중지 → 마지막 청크 전송 보장
    if (mrRef.current?.state === 'recording') {
      mrRef.current.stop()
    }

    // 마지막 데이터 전송 후 WebSocket 닫기 (500ms 대기)
    setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'CloseStream' }))
        wsRef.current.close()
      }
      streamRef.current?.getTracks().forEach((t) => t.stop())
      setIsListening(false)
    }, 500)
  }, [onLog])

  return { isSupported, isListening, startListening, stopListening }
}
