'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CONFIDENCE_THRESHOLD } from '@/store/audioStore'
import { DEFAULT_AUDIO_CONFIG, type AudioProcessingConfig } from '@/store/audioConfigStore'
import type { WordResult } from '@/types'

interface DeepgramOptions {
  onInterimResult?: (text: string, words?: WordResult[]) => void
  onFinalResult?: (text: string, confidence: number, words?: WordResult[]) => void
  onFallback?: (confidence: number, partialText?: string) => void
  onError?: (error: string) => void
  onLog?: (msg: string) => void
  onStreamReady?: (stream: MediaStream) => void
  confidenceThreshold?: number
  processingConfig?: AudioProcessingConfig
}

export function useWebSpeech({
  onFinalResult,
  onFallback,
  onError,
  onLog,
  onStreamReady,
  confidenceThreshold = CONFIDENCE_THRESHOLD,
  processingConfig = DEFAULT_AUDIO_CONFIG,
}: DeepgramOptions) {
  const mrRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // 빠른 탭(준비 완료 전 손 뗌) race 방지용
  const startPromiseRef = useRef<Promise<void> | null>(null)
  const stopRequestedRef = useRef(false)
  const [isListening, setIsListening] = useState(false)
  // Deepgram에 실제로 전송한 "가공본" 재생용 URL (원본과 비교 진단용)
  const [lastProcessedBlobUrl, setLastProcessedBlobUrl] = useState<string | null>(null)
  const isSupported = true

  // 콜백 ref
  const onFinalResultRef = useRef(onFinalResult)
  const onFallbackRef = useRef(onFallback)
  const onLogRef = useRef(onLog)
  const onErrorRef = useRef(onError)
  const onStreamReadyRef = useRef(onStreamReady)
  const confidenceThresholdRef = useRef(confidenceThreshold)
  const processingConfigRef = useRef(processingConfig)

  // ref 동기화
  useEffect(() => { onFinalResultRef.current = onFinalResult }, [onFinalResult])
  useEffect(() => { onFallbackRef.current = onFallback }, [onFallback])
  useEffect(() => { onLogRef.current = onLog }, [onLog])
  useEffect(() => { onErrorRef.current = onError }, [onError])
  useEffect(() => { onStreamReadyRef.current = onStreamReady }, [onStreamReady])
  useEffect(() => { confidenceThresholdRef.current = confidenceThreshold }, [confidenceThreshold])
  useEffect(() => { processingConfigRef.current = processingConfig }, [processingConfig])

  // 가공본 blob을 재생용 URL로 저장 (이전 URL은 즉시 revoke — 1개만 유지, 누수 방지)
  const saveProcessedBlob = useCallback((blob: Blob) => {
    setLastProcessedBlobUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      try {
        return URL.createObjectURL(blob)
      } catch {
        return null
      }
    })
  }, [])

  // 이전 녹음 자원 완전 정리 (녹음기 정지 + 스트림 트랙 종료 + AudioContext close)
  // AudioContext가 누적/suspended되면 가공 스트림이 무음이 되어 "녹음 데이터 없음"이 발생하므로
  // 마이크를 누를 때마다 호출해 깨끗한 상태에서 시작한다.
  const teardownAudio = useCallback(() => {
    try {
      if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop()
    } catch { /* ignore */ }
    mrRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
  }, [])

  const startListening = useCallback(async () => {
    stopRequestedRef.current = false
    // 마이크 누름 = 초기화: 직전에 남아있을 수 있는 오디오 자원을 먼저 정리
    teardownAudio()
    // startListening 완료 시점을 stopListening이 기다릴 수 있도록 promise 노출
    let resolveStart: () => void = () => {}
    startPromiseRef.current = new Promise<void>((r) => { resolveStart = r })

    chunksRef.current = []
    const t0 = performance.now()
    console.group('🎤 [MIC] startListening')
    console.log('① chunksRef 초기화')

    const cfg = processingConfigRef.current
    try {
      console.log('② getUserMedia 요청 중...')
      onLogRef.current?.('마이크 스트림 요청 중...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: cfg.echoCancellation,
          noiseSuppression: cfg.noiseSuppression,
          autoGainControl: cfg.autoGainControl,
          channelCount: 1,
        }
      })
      streamRef.current = stream
      const tracks = stream.getAudioTracks()
      const settings = tracks[0]?.getSettings()
      console.log(`③ 마이크 스트림 획득 성공 (+${(performance.now()-t0).toFixed(0)}ms)`)
      console.log('   트랙:', tracks[0]?.label || 'unknown')
      console.log('   설정:', JSON.stringify({
        sampleRate: settings?.sampleRate,
        channelCount: settings?.channelCount,
        echoCancellation: settings?.echoCancellation,
        noiseSuppression: settings?.noiseSuppression,
      }))
      onLogRef.current?.('마이크 스트림 획득 성공')

      // Web Audio API 노이즈 제거 파이프라인 — 설정값(cfg)으로 노드를 동적 구성
      let processedStream = stream
      try {
        console.log('④ Web Audio 파이프라인 구성 중...')
        const audioCtx = new AudioContext({ sampleRate: 16000 })
        audioCtxRef.current = audioCtx
        // autoplay 정책으로 suspended 상태면 가공 스트림이 무음이 되므로 명시적으로 resume
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume()
          console.log(`   AudioContext resume됨 (state: ${audioCtx.state})`)
        }
        const source = audioCtx.createMediaStreamSource(stream)
        let node: AudioNode = source
        const applied: string[] = []

        if (cfg.highpass.enabled) {
          const highPassFilter = audioCtx.createBiquadFilter()
          highPassFilter.type = 'highpass'
          highPassFilter.frequency.value = cfg.highpass.freq
          node.connect(highPassFilter)
          node = highPassFilter
          applied.push(`highpass ${cfg.highpass.freq}Hz`)
          console.log(`   HighPassFilter: ${cfg.highpass.freq}Hz 이하 제거`)
        }

        if (cfg.lowpass.enabled) {
          const lowPassFilter = audioCtx.createBiquadFilter()
          lowPassFilter.type = 'lowpass'
          lowPassFilter.frequency.value = cfg.lowpass.freq
          node.connect(lowPassFilter)
          node = lowPassFilter
          applied.push(`lowpass ${cfg.lowpass.freq}Hz`)
          console.log(`   LowPassFilter: ${cfg.lowpass.freq}Hz 이상 제거`)
        }

        if (cfg.compressor.enabled) {
          const compressor = audioCtx.createDynamicsCompressor()
          compressor.threshold.value = cfg.compressor.threshold
          compressor.knee.value = cfg.compressor.knee
          compressor.ratio.value = cfg.compressor.ratio
          compressor.attack.value = cfg.compressor.attack
          compressor.release.value = cfg.compressor.release
          node.connect(compressor)
          node = compressor
          applied.push(`compressor ${cfg.compressor.ratio}:1`)
          console.log(`   DynamicsCompressor: threshold=${cfg.compressor.threshold}dB, ratio=${cfg.compressor.ratio}:1`)
        }

        if (applied.length === 0) {
          // 모든 가공 OFF → 원본 그대로 전송
          processedStream = stream
          console.log('   가공 노드 없음 — 원본 스트림 사용')
          onLogRef.current?.('오디오 가공 없음 (원본 전송)')
        } else {
          const destination = audioCtx.createMediaStreamDestination()
          node.connect(destination)
          processedStream = destination.stream
          console.log(`   파이프라인 연결 완료: ${applied.join(' → ')}`)
          onLogRef.current?.(`오디오 가공 적용: ${applied.join(', ')}`)
        }
      } catch (audioErr) {
        console.warn('   Web Audio 파이프라인 실패 — 원본 스트림 사용:', audioErr)
        onLogRef.current?.(`Web Audio 파이프라인 실패 — 원본 스트림 사용: ${audioErr}`)
        processedStream = stream
      }

      onStreamReadyRef.current?.(stream)
      console.log('⑤ onStreamReady 호출 (재생용 원본 스트림 공유)')

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'
      console.log(`⑥ MediaRecorder mimeType: ${mimeType}`)

      const mr = new MediaRecorder(processedStream, { mimeType })
      let chunkCount = 0
      let totalBytes = 0
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
          chunkCount++
          totalBytes += e.data.size
          console.log(
            `🔴 청크 #${String(chunkCount).padStart(3,'0')} | ` +
            `크기: ${e.data.size}B | ` +
            `누적: ${chunkCount}개 / ${(totalBytes/1024).toFixed(1)}KB | ` +
            `경과: ${(performance.now()-t0).toFixed(0)}ms`
          )
        } else {
          console.warn(`⚠️ 빈 청크 #${chunkCount+1} — size=0`)
        }
      }
      mr.start(100)
      mrRef.current = mr
      setIsListening(true)
      console.log(`⑦ MediaRecorder.start(100ms) — 녹음 시작! (+${(performance.now()-t0).toFixed(0)}ms)`)
      console.log('✅ startListening 완료')
      console.groupEnd()
      onLogRef.current?.('녹음 시작 — 말씀하세요')

    } catch (err) {
      onLogRef.current?.(`❌ 마이크 접근 실패: ${err}`)
      onErrorRef.current?.(`마이크 접근 실패: ${err}`)
      setIsListening(false)
    } finally {
      resolveStart()
    }
  }, [teardownAudio])

  const stopListening = useCallback(async () => {
    const t1 = performance.now()
    console.group('🛑 [MIC] stopListening')
    console.log('① MediaRecorder 정지 요청')
    onLogRef.current?.('녹음 종료 — Deepgram 전송 중...')
    setIsListening(false)
    stopRequestedRef.current = true

    // 빠른 탭: startListening이 아직 진행 중이면 녹음기 준비가 끝날 때까지 대기
    // (대기하지 않으면 mrRef가 비어 청크 없이 종료되고, 녹음기가 백그라운드에 남는다)
    if (startPromiseRef.current) {
      console.log('   startListening 완료 대기 중... (race 방지)')
      await startPromiseRef.current
      startPromiseRef.current = null
    }

    // MediaRecorder 정지 후 Blob 수집
    await new Promise<void>((resolve) => {
      if (!mrRef.current || mrRef.current.state === 'inactive') {
        console.log('   MediaRecorder 이미 inactive')
        resolve()
        return
      }
      mrRef.current.onstop = () => {
        console.log(`② MediaRecorder.stop() 완료 (+${(performance.now()-t1).toFixed(0)}ms)`)
        resolve()
      }
      mrRef.current.stop()
    })

    // 스트림 종료 + AudioContext close (누적 방지)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    console.log('③ 스트림 트랙 종료 + AudioContext close')

    // 청크가 없으면 잠시 기다려봄 (타이밍 문제 대응)
    if (chunksRef.current.length === 0) {
      console.warn('⚠️ 청크 없음 — 200ms 대기 후 재확인')
      await new Promise(resolve => setTimeout(resolve, 200))
    }

    const chunks = chunksRef.current
    const totalSize = chunks.reduce((a, b) => a + b.size, 0)
    console.log(`④ 청크 수집 완료: ${chunks.length}개 / ${(totalSize/1024).toFixed(1)}KB`)

    if (chunks.length === 0) {
      console.warn('❌ 최종 청크 없음 — 무시')
      console.groupEnd()
      onLogRef.current?.('녹음 데이터 없음 — 무시')
      return
    }

    const mimeType = mrRef.current?.mimeType || 'audio/webm'
    const blob = new Blob(chunks, { type: mimeType })
    chunksRef.current = []
    // Deepgram에 전송하는 "가공본"을 재생용으로 보관 (원본과 청취 비교 진단용)
    saveProcessedBlob(blob)
    console.log(`⑤ Blob 생성: ${(blob.size/1024).toFixed(1)}KB, type=${blob.type}`)
    console.log(`⑥ Deepgram 전송 시작... (+${(performance.now()-t1).toFixed(0)}ms)`)
    onLogRef.current?.(`Deepgram 전송 중... (${(blob.size / 1024).toFixed(1)}KB)`)

    try {
      // 30초 타임아웃 설정 (긴 발화 대응)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort()
        onLogRef.current?.('⏱️ Deepgram 타임아웃 — 재시도 요청')
      }, 30000)

      // 서버에서 토큰 발급
      console.log('⑦ Deepgram 토큰 요청 중...')
      const tokenRes = await fetch('/api/deepgram-token', { signal: controller.signal })
      if (!tokenRes.ok) {
        console.error('❌ Deepgram 토큰 발급 실패')
        clearTimeout(timeoutId)
        onFallbackRef.current?.(0)
        return
      }
      const { token } = await tokenRes.json()
      console.log('⑧ 토큰 발급 완료 → Deepgram API 전송 중...')

      const params = new URLSearchParams({
        language: 'multi',
        model: 'nova-2',
        smart_format: 'true',
        punctuate: 'true',
        utterances: 'true',
        filler_words: 'false',
        profanity_filter: 'false',
      })

      const dgStart = performance.now()
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
      console.log(`⑨ Deepgram 응답 수신 (${(performance.now()-dgStart).toFixed(0)}ms) — status: ${res.status}`)

      if (!res.ok) {
        console.error(`❌ Deepgram API 오류: ${res.status}`)
        onLogRef.current?.(`Deepgram API 오류: ${res.status} — 재시도 요청`)
        onFallbackRef.current?.(0)
        return
      }

      const data = await res.json()
      const channel = data.results?.channels?.[0]
      const alternative = channel?.alternatives?.[0]

      if (!alternative) {
        console.warn('⚠️ 인식 결과 없음 (alternative 없음)')
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

      console.log(`⑩ 인식 결과:`)
      console.log(`   transcript: "${transcript}"`)
      console.log(`   confidence: ${(confidence * 100).toFixed(1)}%`)
      console.log(`   단어 수: ${words.length}개`)
      if (words.length > 0) {
        console.table(words.map(w => ({
          word: w.word,
          confidence: `${(w.confidence * 100).toFixed(0)}%`,
          start: `${w.start.toFixed(2)}s`,
          end: `${w.end.toFixed(2)}s`,
        })))
      }
      onLogRef.current?.(`인식 완료: "${transcript}" (conf: ${confidence.toFixed(2)})`)

      if (!transcript.trim()) {
        console.warn('⚠️ 빈 텍스트 — 재시도 요청')
        console.groupEnd()
        onLogRef.current?.('빈 텍스트 — 재시도 요청')
        onFallbackRef.current?.(0)
        return
      }

      console.log(`✅ GPT로 전송: "${transcript}"`)
      console.groupEnd()
      onLogRef.current?.(`✅ 전송: "${transcript}" (conf: ${confidence.toFixed(2)})`)
      onFinalResultRef.current?.(transcript, confidence, words)

    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.warn('⏱️ Deepgram 타임아웃')
        onLogRef.current?.('⏱️ 타임아웃 — 재시도 요청')
      } else {
        console.error('❌ Deepgram 오류:', err)
        onLogRef.current?.(`❌ Deepgram 오류: ${err}`)
      }
      console.groupEnd()
      onFallbackRef.current?.(0)
    }
  }, [])

  return { isSupported, isListening, startListening, stopListening, lastProcessedBlobUrl }
}
