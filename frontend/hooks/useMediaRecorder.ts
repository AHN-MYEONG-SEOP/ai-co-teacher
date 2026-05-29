'use client'
import { useCallback, useRef, useState } from 'react'

interface MediaRecorderOptions {
  onBlobReady?: (blob: Blob) => void
  onBlobSaved?: (success: boolean, filename?: string) => void
}

export function useMediaRecorder({ onBlobReady, onBlobSaved }: MediaRecorderOptions = {}) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [lastBlobUrl, setLastBlobUrl] = useState<string | null>(null)

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,        // 모노 (음성에 최적)
          // sampleRate는 기기 기본값 사용 (강제 지정 시 속도 왜곡 발생)
        }
      })
      streamRef.current = stream
      chunksRef.current = []

      // 최고 음질 mimeType 선택
      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm' :
        MediaRecorder.isTypeSupported('audio/mp4')              ? 'audio/mp4' :
        ''

      const options: MediaRecorderOptions = {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000,   // 128kbps (기본값 ~32kbps 대비 4배)
      }

      const mediaRecorder = new MediaRecorder(stream, options)
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      mediaRecorder.start(100)
      mediaRecorderRef.current = mediaRecorder
      setIsRecording(true)
    } catch (err) {
      console.error('MediaRecorder 시작 실패:', err)
    }
  }, [])

  // Blob → URL 저장
  const _saveBlob = useCallback((blob: Blob) => {
    setLastBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    try {
      const url = URL.createObjectURL(blob)
      setLastBlobUrl(url)
      onBlobSaved?.(true, undefined)
    } catch {
      onBlobSaved?.(false)
    }
  }, [onBlobSaved])

  // Path A: 신뢰도 충족 → Blob 저장
  const discardBlob = useCallback(() => {
    if (!mediaRecorderRef.current) return
    mediaRecorderRef.current.onstop = () => {
      if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, {
          type: mediaRecorderRef.current?.mimeType || 'audio/webm',
        })
        _saveBlob(blob)
      }
      chunksRef.current = []
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }, [_saveBlob])

  // Path B: 신뢰도 미달 → Blob 저장 + Whisper 전송
  const exportBlob = useCallback(() => {
    if (!mediaRecorderRef.current) return
    mediaRecorderRef.current.onstop = () => {
      const blob = new Blob(chunksRef.current, {
        type: mediaRecorderRef.current?.mimeType || 'audio/webm',
      })
      _saveBlob(blob)
      chunksRef.current = []
      streamRef.current?.getTracks().forEach((t) => t.stop())
      onBlobReady?.(blob)
    }
    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }, [_saveBlob, onBlobReady])

  return { isRecording, lastBlobUrl, startRecording, discardBlob, exportBlob }
}
