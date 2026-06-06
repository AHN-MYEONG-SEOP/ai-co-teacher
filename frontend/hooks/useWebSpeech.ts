'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CONFIDENCE_THRESHOLD } from '@/store/audioStore'
import { DEFAULT_AUDIO_CONFIG, type AudioProcessingConfig } from '@/store/audioConfigStore'
import type { WordResult } from '@/types'

interface DeepgramOptions {
  onInterimResult?: (text: string, words?: WordResult[]) => void
  onFinalResult?: (text: string, confidence: number, words?: WordResult[], blobUrl?: string, ipa?: string) => void
  onFallback?: (confidence: number, partialText?: string) => void
  onError?: (error: string) => void
  onLog?: (msg: string) => void
  onStreamReady?: (stream: MediaStream) => void
  confidenceThreshold?: number
  processingConfig?: AudioProcessingConfig
  // 오늘 배우는 target 단어들 — Deepgram keyword boosting(문맥 힌트)에 사용
  keywords?: string[]
  sttEngine?: 'deepgram' | 'huggingface'
}

export function useWebSpeech({
  onFinalResult,
  onFallback,
  onError,
  onLog,
  onStreamReady,
  confidenceThreshold = CONFIDENCE_THRESHOLD,
  processingConfig = DEFAULT_AUDIO_CONFIG,
  keywords = [],
  sttEngine = 'deepgram' as 'deepgram' | 'huggingface',
}: DeepgramOptions) {
  const mrRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  // 예열된 가공 스트림 (세션 내내 유지) + 빌드 시 설정 키 + 진행 중 prepare promise
  const processedStreamRef = useRef<MediaStream | null>(null)
  const preparedKeyRef = useRef<string | null>(null)
  const preparePromiseRef = useRef<Promise<void> | null>(null)
  const chunksRef = useRef<Blob[]>([])
  // 빠른 탭(준비 완료 전 손 뗌) race 방지용
  const startPromiseRef = useRef<Promise<void> | null>(null)
  const stopRequestedRef = useRef(false)
  const [isListening, setIsListening] = useState(false)
  // 마이크 예열 완료 여부 (UI에서 "준비 중" 표시 등에 사용 가능)
  const [isReady, setIsReady] = useState(false)
  // Deepgram에 실제로 전송한 "가공본" 재생용 URL (원본과 비교 진단용)
  const [lastProcessedBlobUrl, setLastProcessedBlobUrl] = useState<string | null>(null)
  const lastProcessedBlobUrlRef = useRef<string | null>(null)
  const isSupported = true

  // 콜백 ref
  const onFinalResultRef = useRef(onFinalResult)
  const onFallbackRef = useRef(onFallback)
  const onLogRef = useRef(onLog)
  const onErrorRef = useRef(onError)
  const onStreamReadyRef = useRef(onStreamReady)
  const confidenceThresholdRef = useRef(confidenceThreshold)
  const processingConfigRef = useRef(processingConfig)
  const keywordsRef = useRef(keywords)
  const sttEngineRef = useRef(sttEngine)
  useEffect(() => { sttEngineRef.current = sttEngine }, [sttEngine])
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const silenceAnalyserRef = useRef<AnalyserNode | null>(null)
  const silenceRafRef = useRef<number | null>(null)
  const stopListeningRef = useRef<(() => Promise<void>) | null>(null)
  const SILENCE_THRESHOLD = 10    // 음량 임계값 (0~255)
  const SILENCE_DELAY_MS = 3000   // 3초 침묵 시 자동 전송

  // ref 동기화
  useEffect(() => { onFinalResultRef.current = onFinalResult }, [onFinalResult])
  useEffect(() => { onFallbackRef.current = onFallback }, [onFallback])
  useEffect(() => { onLogRef.current = onLog }, [onLog])
  useEffect(() => { onErrorRef.current = onError }, [onError])
  useEffect(() => { onStreamReadyRef.current = onStreamReady }, [onStreamReady])
  useEffect(() => { confidenceThresholdRef.current = confidenceThreshold }, [confidenceThreshold])
  useEffect(() => { processingConfigRef.current = processingConfig }, [processingConfig])
  useEffect(() => { keywordsRef.current = keywords }, [keywords])

  // 가공본 blob을 재생용 URL로 저장 (이전 URL은 즉시 revoke — 1개만 유지, 누수 방지)
  const saveProcessedBlob = useCallback((blob: Blob) => {
    setLastProcessedBlobUrl((prev) => {
      // revoke하지 않음 — 말풍선 재생 버튼에서 사용 중일 수 있음
      void prev
      try {
        const newUrl = URL.createObjectURL(blob)
        lastProcessedBlobUrlRef.current = newUrl
        return newUrl
      } catch {
        return null
      }
    })
  }, [])

  // 오디오 자원 완전 해제 (언마운트 또는 설정 변경에 따른 재빌드 시에만)
  const teardownAudio = useCallback(() => {
    try {
      if (mrRef.current && mrRef.current.state !== 'inactive') mrRef.current.stop()
    } catch { /* ignore */ }
    mrRef.current = null
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    processedStreamRef.current = null
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    preparedKeyRef.current = null
    setIsReady(false)
  }, [])

  // 마이크 스트림 + Web Audio 파이프라인을 "예열"한다.
  // 한 번 준비하면 세션 내내 유지(warm)되어, 마이크를 누르면 getUserMedia 지연 없이
  // 즉시 녹음을 시작할 수 있다 → 발화 앞부분 잘림 방지.
  const prepare = useCallback((): Promise<void> => {
    const cfg = processingConfigRef.current
    const key = JSON.stringify(cfg)
    const trackLive = streamRef.current?.getAudioTracks()[0]?.readyState === 'live'

    // 이미 따뜻하고 설정도 동일 → resume만 보장하고 즉시 반환
    if (trackLive && audioCtxRef.current && processedStreamRef.current && preparedKeyRef.current === key) {
      return audioCtxRef.current.state === 'suspended'
        ? audioCtxRef.current.resume()
        : Promise.resolve()
    }
    // 준비가 진행 중이면 그 promise 재사용 (중복 getUserMedia 방지)
    if (preparePromiseRef.current) return preparePromiseRef.current

    const p = (async () => {
      // 트랙이 죽었거나(기기 변경 등) 설정이 바뀌었으면 깨끗이 정리 후 재구성
      teardownAudio()
      console.group('🔥 [MIC] prepare (예열)')
      onLogRef.current?.('마이크 예열 중...')
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: cfg.echoCancellation,
          noiseSuppression: cfg.noiseSuppression,
          autoGainControl: cfg.autoGainControl,
          channelCount: 1,
        },
      })
      streamRef.current = stream
      console.log('마이크 스트림 획득:', stream.getAudioTracks()[0]?.label || 'unknown')

      // Web Audio 파이프라인 구성 (설정값 기반)
      let processedStream = stream
      try {
        const audioCtx = new AudioContext({ sampleRate: 16000 })
        audioCtxRef.current = audioCtx
        if (audioCtx.state === 'suspended') await audioCtx.resume()
        const source = audioCtx.createMediaStreamSource(stream)
        let node: AudioNode = source
        const applied: string[] = []

        if (cfg.highpass.enabled) {
          const hp = audioCtx.createBiquadFilter()
          hp.type = 'highpass'; hp.frequency.value = cfg.highpass.freq
          node.connect(hp); node = hp
          applied.push(`highpass ${cfg.highpass.freq}Hz`)
        }
        if (cfg.lowpass.enabled) {
          const lp = audioCtx.createBiquadFilter()
          lp.type = 'lowpass'; lp.frequency.value = cfg.lowpass.freq
          node.connect(lp); node = lp
          applied.push(`lowpass ${cfg.lowpass.freq}Hz`)
        }
        if (cfg.compressor.enabled) {
          const comp = audioCtx.createDynamicsCompressor()
          comp.threshold.value = cfg.compressor.threshold
          comp.knee.value = cfg.compressor.knee
          comp.ratio.value = cfg.compressor.ratio
          comp.attack.value = cfg.compressor.attack
          comp.release.value = cfg.compressor.release
          node.connect(comp); node = comp
          applied.push(`compressor ${cfg.compressor.ratio}:1`)
        }

        if (applied.length === 0) {
          processedStream = stream
          onLogRef.current?.('오디오 가공 없음 (원본 전송)')
        } else {
          const destination = audioCtx.createMediaStreamDestination()
          node.connect(destination)
          processedStream = destination.stream
          onLogRef.current?.(`오디오 가공 준비: ${applied.join(', ')}`)
        }
      } catch (audioErr) {
        console.warn('Web Audio 파이프라인 실패 — 원본 사용:', audioErr)
        onLogRef.current?.(`Web Audio 실패 — 원본 사용: ${audioErr}`)
        processedStream = stream
      }

      processedStreamRef.current = processedStream
      preparedKeyRef.current = key
      setIsReady(true)
      console.log('✅ 예열 완료 — 마이크 대기 (즉시 녹음 가능)')
      console.groupEnd()
    })()

    preparePromiseRef.current = p
    p.catch((err) => {
      onLogRef.current?.(`❌ 마이크 예열 실패: ${err}`)
      onErrorRef.current?.(`마이크 접근 실패: ${err}`)
    }).finally(() => { preparePromiseRef.current = null })
    return p
  }, [teardownAudio])

  // 마운트 시 즉시 예열 → 첫 녹음부터 지연 없음. 언마운트 시 자원 해제.
  useEffect(() => {
    prepare().catch(() => {})
    return () => { teardownAudio() }
  }, [prepare, teardownAudio])

  const startListening = useCallback(async () => {
    stopRequestedRef.current = false
    let resolveStart: () => void = () => {}
    startPromiseRef.current = new Promise<void>((r) => { resolveStart = r })
    chunksRef.current = []
    const t0 = performance.now()
    console.group('🎤 [MIC] startListening')

    try {
      // 예열돼 있으면 즉시(수 ms), 아니면(첫 사용/설정 변경/트랙 종료) 여기서 준비
      await prepare()
      const processedStream = processedStreamRef.current
      if (!processedStream || !streamRef.current) throw new Error('오디오 스트림 준비 실패')

      // 원본 스트림 공유 → 원본 녹음기(useMediaRecorder)도 이 시점에 녹음 시작
      onStreamReadyRef.current?.(streamRef.current)

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4'

      const mr = new MediaRecorder(processedStream, { mimeType })
      let chunkCount = 0
      let totalBytes = 0
      mr.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
          chunkCount++
          totalBytes += e.data.size
          console.log(`🔴 청크 #${String(chunkCount).padStart(3,'0')} | ${e.data.size}B | 누적 ${(totalBytes/1024).toFixed(1)}KB | +${(performance.now()-t0).toFixed(0)}ms`)
        } else {
          console.warn(`⚠️ 빈 청크 #${chunkCount+1} — size=0`)
        }
      }
      mr.start(100)
      mrRef.current = mr
      setIsListening(true)
      console.log(`✅ 녹음 시작! (+${(performance.now()-t0).toFixed(0)}ms — 예열 상태면 즉시)`)
      console.groupEnd()
      onLogRef.current?.('녹음 시작 — 말씀하세요')

      // ── VAD: 3초 침묵 시 자동 전송 ──────────────────────
      try {
        const actx = audioCtxRef.current
        if (actx) {
          const analyser = actx.createAnalyser()
          analyser.fftSize = 512
          const source = actx.createMediaStreamSource(processedStream)
          source.connect(analyser)
          silenceAnalyserRef.current = analyser
          const dataArr = new Uint8Array(analyser.frequencyBinCount)

          const checkSilence = () => {
            if (!mrRef.current || mrRef.current.state !== 'recording') return
            analyser.getByteFrequencyData(dataArr)
            const avg = dataArr.reduce((a, b) => a + b, 0) / dataArr.length

            if (avg < SILENCE_THRESHOLD) {
              // 침묵 감지 — 타이머 없으면 시작
              if (!silenceTimerRef.current) {
                silenceTimerRef.current = setTimeout(async () => {
                  onLogRef.current?.('🔇 3초 침묵 감지 — 자동 전송')
                  if (silenceRafRef.current) cancelAnimationFrame(silenceRafRef.current)
                  silenceTimerRef.current = null
                  await stopListeningRef.current?.()
                }, SILENCE_DELAY_MS)
              }
            } else {
              // 소리 감지 — 타이머 초기화
              if (silenceTimerRef.current) {
                clearTimeout(silenceTimerRef.current)
                silenceTimerRef.current = null
              }
            }
            silenceRafRef.current = requestAnimationFrame(checkSilence)
          }
          silenceRafRef.current = requestAnimationFrame(checkSilence)
        }
      } catch (vadErr) {
        console.warn('VAD 초기화 실패:', vadErr)
      }
    } catch (err) {
      console.groupEnd()
      onLogRef.current?.(`❌ 녹음 시작 실패: ${err}`)
      onErrorRef.current?.(`마이크 접근 실패: ${err}`)
      setIsListening(false)
    } finally {
      resolveStart()
    }
  }, [prepare])

  const stopListening = useCallback(async () => {
    // VAD 정리
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    if (silenceRafRef.current) { cancelAnimationFrame(silenceRafRef.current); silenceRafRef.current = null }
    silenceAnalyserRef.current = null
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

    // 스트림/AudioContext는 종료하지 않고 유지(warm) → 다음 녹음 즉시 시작
    // (자원 해제는 언마운트 시 teardownAudio에서)
    console.log('③ 녹음기만 정지 — 스트림/AudioContext는 예열 유지')

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
    // Blob URL 생성 — onFinalResult 콜백으로 전달됨
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

      // 문맥 힌트 — 오늘 배우는 target 단어를 keyword boosting으로 전달.
      // 발음이 다소 뭉개져도 해당 단어로 인식될 확률이 올라간다 (연음 인식 보완).
      // 형식: keywords=word:intensifier (intensifier 클수록 강하게 부스트)
      const kw = Array.from(new Set(
        (keywordsRef.current || [])
          .flatMap((w) => w.split(/[,/]/))
          .map((w) => w.trim().replace(/\s+/g, ' '))
          .filter((w) => w.length >= 2 && w.length <= 30)
      )).slice(0, 80)                                  // 과다 전송 방지
      for (const word of kw) {
        params.append('keywords', `${word}:2`)
      }
      if (kw.length > 0) {
        console.log(`⑧-1 keyword boosting: ${kw.length}개 (${kw.slice(0, 6).join(', ')}${kw.length > 6 ? '...' : ''})`)
      }

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
      onFinalResultRef.current?.(transcript, confidence, words, lastProcessedBlobUrlRef.current || undefined)

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

  useEffect(() => { stopListeningRef.current = stopListening }, [stopListening])

  return { isSupported, isListening, isReady, startListening, stopListening, lastProcessedBlobUrl }
}
