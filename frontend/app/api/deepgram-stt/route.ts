import { NextRequest, NextResponse } from 'next/server'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as Blob
    const keywords = formData.get('keywords') as string || ''
    
    if (!audio) return NextResponse.json({ error: 'audio 필요' }, { status: 400 })

    const arrayBuffer = await audio.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const params = new URLSearchParams({
      model: 'nova-2',
      language: 'en',
      punctuate: 'true',
      words: 'true',
    })

    // keyword boosting
    if (keywords) {
      keywords.split(',').forEach(w => {
        if (w.trim()) params.append('keywords', w.trim() + ':2')
      })
    }

    const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
      method: 'POST',
      headers: {
        'Authorization': 'Token ' + process.env.DEEPGRAM_API_KEY,
        'Content-Type': 'audio/webm',
      },
      body: buffer,
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error('Deepgram 오류: ' + err)
    }

    const data = await res.json()
    const alt = data.results?.channels?.[0]?.alternatives?.[0]
    
    return NextResponse.json({
      transcript: alt?.transcript || '',
      confidence: alt?.confidence || 0,
      words: (alt?.words || []).map((w: any) => ({
        word: w.word,
        start: w.start,
        end: w.end,
        confidence: w.confidence,
      }))
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
