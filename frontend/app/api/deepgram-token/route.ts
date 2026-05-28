import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const apiKey = process.env.DEEPGRAM_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Deepgram API 키 없음' }, { status: 500 })
  }
  // API 키를 직접 반환 (서버사이드에서만 읽힘)
  return NextResponse.json({ token: apiKey })
}
