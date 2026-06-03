import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

export const dynamic = 'force-dynamic'

// ElevenLabs 기본 보이스 ID (Rachel - 친근한 영어 원어민 여성)
const ELEVENLABS_DEFAULT_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'

async function ttsOpenAI(text: string, voice: string): Promise<Buffer> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const mp3 = await openai.audio.speech.create({
    model: 'tts-1',
    voice: voice as 'nova' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'shimmer',
    input: text,
    speed: 0.95,
  })
  return Buffer.from(await mp3.arrayBuffer())
}

async function ttsElevenLabs(text: string, voiceId: string): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY
  if (!apiKey) throw new Error('ElevenLabs API 키 없음')

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.3,
          use_speaker_boost: true,
        },
      }),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`ElevenLabs 오류: ${err}`)
  }

  return Buffer.from(await res.arrayBuffer())
}

export async function POST(req: NextRequest) {
  try {
    const { text, voice = 'nova', voiceId } = await req.json()

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const provider = process.env.TTS_PROVIDER || 'openai'
    let buffer: Buffer
    let usedProvider = provider

    if (provider === 'elevenlabs') {
      // ElevenLabs 실패(키 만료·쿼터 소진 등) 시 OpenAI TTS로 자동 폴백 — 음성이 끊기지 않도록
      try {
        buffer = await ttsElevenLabs(text, voiceId || ELEVENLABS_DEFAULT_VOICE_ID)
      } catch (elevenErr) {
        console.error('ElevenLabs TTS 실패 → OpenAI 폴백:', elevenErr)
        buffer = await ttsOpenAI(text, voice)
        usedProvider = 'openai-fallback'
      }
    } else {
      buffer = await ttsOpenAI(text, voice)
    }

    return new NextResponse(buffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length.toString(),
        'X-TTS-Provider': usedProvider,
      },
    })
  } catch (error) {
    console.error('TTS API 오류:', error)
    return NextResponse.json({ error: 'TTS API 오류' }, { status: 500 })
  }
}
