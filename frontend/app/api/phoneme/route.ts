import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const blob = await req.blob()

    const response = await fetch(
      'https://api-inference.huggingface.co/models/facebook/wav2vec2-base-960h',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'audio/webm',
        },
        body: blob,
      }
    )

    if (!response.ok) {
      const error = await response.text()
      console.error('HuggingFace API 오류:', response.status, error)
      return NextResponse.json({ 
        error, 
        status: response.status,
        hint: response.status === 503 ? '모델 로딩 중 (30초 후 재시도)' : '오류 발생'
      }, { status: response.status })
    }

    const result = await response.json()

    // 음소 시퀀스를 IPA 문자열로 변환
    const ipa = Array.isArray(result)
      ? result.map((r: { token_str: string }) => r.token_str).join('')
      : ''

    return NextResponse.json({ ipa, raw: result })

  } catch (e) {
    console.error('phoneme API 오류:', e)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
