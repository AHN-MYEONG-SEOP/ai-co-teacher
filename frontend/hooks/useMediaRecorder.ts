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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      chunksRef.current = []

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4'

      const mediaRecorder = new MediaRecorder(stream, { mimeType })
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

  // Blob 저장 공통 처리
  const _saveBlob = useCallback((blob: Blob) => {
    // 이전 URL 해제
    setLastBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })

    try {
      const url = URL.createObjectURL(blob)
      setLastBlobUrl(url)

      // 파일 다운로드
      const filename = `recording-${Date.now()}.webm`
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)

      onBlobSaved?.(true, filename)
    } catch {
      onBlobSaved?.(false)
    }
  }, [onBlobSaved])

  // Path A: 신뢰도 충족 → Blob 저장 후 파기
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
