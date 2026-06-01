'use client'
import { useCallback, useRef, useState } from 'react'

interface MediaRecorderHookOptions {
  onBlobReady?: (blob: Blob) => void
  onBlobSaved?: (success: boolean, filename?: string) => void
}

export function useMediaRecorder({ onBlobReady, onBlobSaved }: MediaRecorderHookOptions = {}) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [isRecording, setIsRecording] = useState(false)
  const [lastBlobUrl, setLastBlobUrl] = useState<string | null>(null)

  // 외부 스트림을 받아서 녹음 시작 (마이크를 직접 열지 않음)
  const startRecording = useCallback((stream: MediaStream) => {
    try {
      chunksRef.current = []

      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm' :
        MediaRecorder.isTypeSupported('audio/mp4')              ? 'audio/mp4' :
        ''

      const mediaRecorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000,
      })

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

  const _saveBlob = useCallback((blob: Blob) => {
    setLastBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    try {
      const url = URL.createObjectURL(blob)
      setLastBlobUrl(url)
      onBlobSaved?.(true)
    } catch {
      onBlobSaved?.(false)
    }
  }, [onBlobSaved])

  // Path A: 신뢰도 충족 → Blob 저장 (스트림은 useWebSpeech가 종료)
  const discardBlob = useCallback(() => {
    const mr = mediaRecorderRef.current
    if (!mr) return
    const save = () => {
      if (chunksRef.current.length > 0) {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
        _saveBlob(blob)
      }
      chunksRef.current = []
    }
    if (mr.state === 'recording') {
      mr.onstop = save
      mr.stop()
    } else {
      // useWebSpeech가 공유 스트림 트랙을 먼저 종료해 recorder가 이미 inactive인 경우:
      // onstop이 다시 안 터지므로 모아둔 청크로 즉시 저장 (원본 재생 누락 버그 수정)
      save()
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
      onBlobReady?.(blob)
    }
    if (mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setIsRecording(false)
  }, [_saveBlob, onBlobReady])

  return { isRecording, lastBlobUrl, startRecording, discardBlob, exportBlob }
}
