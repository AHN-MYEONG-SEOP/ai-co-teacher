import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audioBlob = formData.get('audio') as Blob
    if (!audioBlob) {
      return NextResponse.json({ error: 'audio is required' }, { status: 400 })
    }

    const arrayBuffer = await audioBlob.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // HuggingFace Inference API — wav2vec2 IPA 모델
    const hfRes = await fetch(
      'https://api-inference.huggingface.co/models/facebook/wav2vec2-lv-60-espeak-cv-ft',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HUGGINGFACE_API_KEY}`,
          'Content-Type': 'audio/webm',
        },
        body: buffer,
      }
    )

    if (!hfRes.ok) {
      const err = await hfRes.text()
      console.error('HuggingFace 오류:', err)
      return NextResponse.json({ error: `HuggingFace 오류: ${hfRes.status}` }, { status: 500 })
    }

    const result = await hfRes.json()
    // 결과 형식: [{ score, text }] 또는 { text }
    const text = Array.isArray(result) ? result[0]?.text : result?.text
    return NextResponse.json({ text: text || '', raw: result })

  } catch (error) {
    console.error('HuggingFace STT 오류:', error)
    return NextResponse.json({ error: 'HuggingFace STT 오류' }, { status: 500 })
  }
}
