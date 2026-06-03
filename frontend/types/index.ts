// STT 처리 경로
export type STTPath = 'A' | 'B'
// 아바타 상태
export type AvatarStatus = 'idle' | 'listening' | 'processing' | 'speaking'
// Web Speech API 결과
export interface SpeechResult {
  text: string
  confidence: number
  path: STTPath
  isFinal: boolean
}
// Whisper API 응답 (FastAPI)
export interface WhisperResponse {
  text: string
  confidence: number
  duration_ms: number
}
// 피드백 데이터 (인라인 표시용)
export interface MessageFeedback {
  grammar: number
  fluency: number
  vocabulary: number
  overall: number
  correction: string | null
  tip: string
}
// 단어별 인식 결과
export interface WordResult {
  word: string
  confidence: number  // 0~1
  start: number
  end: number
}
// 대화 메시지
export interface ConversationMessage {
  id: string
  role: 'student' | 'ai'
  content: string
  sttPath?: STTPath
  confidence?: number
  latencyMs?: number
  createdAt: string
  feedback?: MessageFeedback
  words?: WordResult[]
  translation?: string
  choices?: string[]   // AI가 제시하는 선택지
  sceneKr?: string     // 현재 step의 한국어 상황 설명 (AI 발화 전 안내)
  sceneStep?: number   // 해당 상황 설명이 속한 step 번호 (step별 구분 표시용)
}
// Supabase 테이블 타입
export interface Profile {
  id: string
  role: 'student' | 'teacher'
  name: string
  created_at: string
}
export interface Class {
  id: string
  teacher_id: string
  name: string
  created_at: string
}
export interface Session {
  id: string
  class_id: string
  started_at: string
  ended_at: string | null
}
export interface ConversationLog {
  id: string
  session_id: string
  student_id: string
  role: 'student' | 'ai'
  content: string
  stt_path: STTPath | null
  confidence: number | null
  latency_ms: number | null
  created_at: string
}
