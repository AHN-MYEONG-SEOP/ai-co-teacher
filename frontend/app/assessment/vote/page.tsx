'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface SessionInfo {
  id: string
  session_key: string
  session_date: string
  session_time: string
  current_student_id: string | null
  current_step: number
  status: string
}

interface StudentInfo {
  id: string
  name: string
  nickname: string
}

type Reaction = 'great' | 'cheer' | 'effort'

const SCORE_ITEMS = [
  { key: 'pronunciation', label: 'Pronunciation', desc: '발음 정확도 / Accuracy' },
  { key: 'completeness',  label: 'Completeness',  desc: '문장 완성도 / Full sentence' },
  { key: 'pacing',        label: 'Pacing',         desc: '말하기 속도 / Speaking speed' },
  { key: 'pausing',       label: 'Pausing',        desc: '쉼 자연스러움 / Natural pauses' },
  { key: 'attitude',      label: 'Attitude',       desc: '태도 / Attitude' },
  { key: 'confidence',    label: 'Confidence',     desc: '자신감 / Confidence' },
  { key: 'effort',        label: 'Effort',         desc: '노력도 / Effort' },
]

export default function AssessmentVotePage() {
  const [myProfile, setMyProfile] = useState<{id:string, name:string, nickname:string, role:string} | null>(null)
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [currentStudent, setCurrentStudent] = useState<StudentInfo | null>(null)
  const [totalSteps, setTotalSteps] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  // 선생님 점수
  const [scores, setScores] = useState<Record<string, number>>({})
  const [comment, setComment] = useState('')

  // 학생 반응
  const [reaction, setReaction] = useState<Reaction | null>(null)

  const supabase = createClient()
  const sessionId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('session_id') || ''
    : ''

  // 내 프로필 로드
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/login'; return }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, nickname, role')
        .eq('id', user.id)
        .single()
      setMyProfile(profile)
    }
    load()
  }, [])

  // 세션 + 현재 학생 로드
  const loadSession = useCallback(async () => {
    if (!sessionId || !myProfile) return
    const { data: sess } = await supabase
      .from('asm_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    if (!sess) return
    setSession(sess)

    if (sess.current_student_id) {
      const { data: student } = await supabase
        .from('profiles')
        .select('id, name, nickname')
        .eq('id', sess.current_student_id)
        .single()
      setCurrentStudent(student)

      // 시나리오 total_steps
      if (sess.current_scenario_id) {
        const { data: scenario } = await supabase
          .from('asm_scenarios')
          .select('total_steps')
          .eq('id', sess.current_scenario_id)
          .single()
        setTotalSteps(scenario?.total_steps || 0)
      }

      // 이미 제출했는지 확인
      if (myProfile.role === 'teacher') {
        const { data: existing } = await supabase
          .from('asm_teacher_scores')
          .select('id')
          .eq('session_id', sessionId)
          .eq('student_id', sess.current_student_id)
          .eq('teacher_id', myProfile.id)
          .single()
        setSubmitted(!!existing)
      } else {
        const { data: existing } = await supabase
          .from('asm_student_likes')
          .select('id, reaction')
          .eq('session_id', sessionId)
          .eq('to_student_id', sess.current_student_id)
          .eq('from_student_id', myProfile.id)
          .single()
        setSubmitted(!!(existing?.reaction))
        if (existing?.reaction) setReaction(existing.reaction as Reaction)
      }

      // row 미리 생성 (접속 표시용)
      await initRows(sess.current_student_id)
    }
    setLoading(false)
  }, [sessionId, myProfile])

  // 접속 시 row 미리 생성
  const initRows = async (targetStudentId: string) => {
    if (!myProfile || !sessionId) return
    const key = sessionId + '-' + targetStudentId + '-' + myProfile.id

    if (myProfile.role === 'teacher') {
      await supabase.from('asm_teacher_scores').upsert({
        score_key: key,
        session_id: sessionId,
        student_id: targetStudentId,
        teacher_id: myProfile.id,
      }, { onConflict: 'score_key', ignoreDuplicates: true })
    } else if (myProfile.id !== targetStudentId) {
      await supabase.from('asm_student_likes').upsert({
        like_key: key,
        session_id: sessionId,
        to_student_id: targetStudentId,
        from_student_id: myProfile.id,
      }, { onConflict: 'like_key', ignoreDuplicates: true })
    }
  }

  useEffect(() => { if (myProfile) loadSession() }, [myProfile, loadSession])

  // Realtime 구독
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel('asm_vote_' + sessionId)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'asm_sessions',
        filter: 'id=eq.' + sessionId
      }, () => {
        setSubmitted(false)
        setScores({})
        setComment('')
        setReaction(null)
        loadSession()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, loadSession])

  // 선생님 전송
  const handleTeacherSubmit = async () => {
    if (!myProfile || !session?.current_student_id || !comment.trim()) return
    if (SCORE_ITEMS.some(item => !scores[item.key])) return
    setSending(true)
    try {
      const key = sessionId + '-' + session.current_student_id + '-' + myProfile.id
      const avg = Math.round(Object.values(scores).reduce((a,b) => a+b, 0) / SCORE_ITEMS.length * 10) / 10
      await supabase.from('asm_teacher_scores').upsert({
        score_key: key,
        session_id: sessionId,
        student_id: session.current_student_id,
        teacher_id: myProfile.id,
        pronunciation: scores.pronunciation,
        completeness: scores.completeness,
        pacing: scores.pacing,
        pausing: scores.pausing,
        attitude: scores.attitude,
        confidence: scores.confidence,
        effort: scores.effort,
        comment: comment.trim(),
        score: avg,
      }, { onConflict: 'score_key' })
      setSubmitted(true)
    } finally {
      setSending(false)
    }
  }

  // 학생 전송
  const handleStudentSubmit = async () => {
    if (!myProfile || !session?.current_student_id || !reaction) return
    setSending(true)
    try {
      const key = sessionId + '-' + session.current_student_id + '-' + myProfile.id
      await supabase.from('asm_student_likes').upsert({
        like_key: key,
        session_id: sessionId,
        to_student_id: session.current_student_id,
        from_student_id: myProfile.id,
        reaction,
      }, { onConflict: 'like_key' })
      setSubmitted(true)
    } finally {
      setSending(false)
    }
  }

  const avgScore = SCORE_ITEMS.length > 0
    ? (Object.values(scores).reduce((a,b) => a+b, 0) / Math.max(Object.keys(scores).length, 1)).toFixed(1)
    : '0'

  const canSubmitTeacher = SCORE_ITEMS.every(item => scores[item.key]) && comment.trim().length > 0
  const canSubmitStudent = reaction !== null

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-white">로딩 중...</p>
    </div>
  )

  if (!session || session.status === 'ended') return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-5xl">🏁</p>
        <p className="text-white text-xl font-bold">평가가 종료됐습니다</p>
      </div>
    </div>
  )

  if (!session.current_student_id) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-5xl animate-pulse">⏳</p>
        <p className="text-white text-xl font-bold">선생님을 기다리고 있어요</p>
        <p className="text-slate-400 text-sm">평가가 시작되면 자동으로 바뀝니다</p>
      </div>
    </div>
  )

  // 본인이 테스트 중인 경우
  if (myProfile?.id === session.current_student_id) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-center space-y-3">
        <p className="text-6xl">🎤</p>
        <p className="text-white text-2xl font-bold">지금 내 차례입니다!</p>
        <p className="text-slate-400">말하기 화면으로 이동해주세요</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-4">

        {/* 헤더 */}
        <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-lg">🎤 {currentStudent?.nickname || currentStudent?.name}</p>
              <p className="text-slate-400 text-xs mt-0.5">Step {session.current_step} / {totalSteps}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-400 text-xs">{session.session_date}</p>
              <p className="text-slate-500 text-xs">{session.session_time}</p>
            </div>
          </div>
        </div>

        {/* 전송 완료 */}
        {submitted ? (
          <div className="bg-emerald-900/30 border border-emerald-700 rounded-2xl p-8 text-center space-y-3">
            <p className="text-5xl">✅</p>
            <p className="text-emerald-400 text-xl font-bold">전송 완료!</p>
            <p className="text-slate-400 text-sm">다음 학생이 시작되면 자동으로 바뀝니다</p>
          </div>
        ) : (
          <>
            {/* 선생님 평가 */}
            {myProfile?.role === 'teacher' && (
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4">
                <p className="text-white font-medium">👩‍🏫 {currentStudent?.nickname} 평가</p>

                {SCORE_ITEMS.map(item => (
                  <div key={item.key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-300">{item.label}</span>
                      <span className="text-xs text-slate-500">{item.desc}</span>
                    </div>
                    <div className="flex gap-2">
                      {[1,2,3,4,5].map(n => (
                        <button
                          key={n}
                          onClick={() => setScores(p => ({...p, [item.key]: n}))}
                          className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                            scores[item.key] === n
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                          }`}
                        >{n}</button>
                      ))}
                    </div>
                  </div>
                ))}

                {/* 평균 */}
                <div className="flex justify-between items-center bg-slate-800 rounded-xl px-4 py-2">
                  <span className="text-slate-400 text-sm">평균</span>
                  <span className="text-yellow-400 font-bold text-lg">{avgScore}점</span>
                </div>

                {/* 한마디 */}
                <div className="space-y-1">
                  <label className="text-sm text-slate-300">한마디 <span className="text-red-400">*필수</span></label>
                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="학생에게 한마디를 남겨주세요 / Leave a comment"
                    rows={2}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500 resize-none"
                  />
                </div>

                <button
                  onClick={handleTeacherSubmit}
                  disabled={!canSubmitTeacher || sending}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl font-medium transition-colors"
                >
                  {sending ? '전송 중...' : '전송'}
                </button>
              </div>
            )}

            {/* 학생 반응 */}
            {myProfile?.role === 'student' && (
              <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 space-y-4">
                <p className="text-white font-medium">👨‍🎓 {currentStudent?.nickname}에게 반응 주기</p>

                <div className="space-y-3">
                  {[
                    { value: 'great', emoji: '👍', label: '잘했어요 / Great job!' },
                    { value: 'cheer', emoji: '📣', label: '응원해요 / Cheer up!' },
                    { value: 'effort', emoji: '💪', label: '열심히하세요 / Keep trying!' },
                  ].map(r => (
                    <button
                      key={r.value}
                      onClick={() => setReaction(r.value as Reaction)}
                      className={`w-full py-4 rounded-2xl text-lg font-medium transition-colors flex items-center justify-center gap-3 ${
                        reaction === r.value
                          ? 'bg-emerald-600 text-white scale-105'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      <span className="text-2xl">{r.emoji}</span>
                      <span>{r.label}</span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleStudentSubmit}
                  disabled={!canSubmitStudent || sending}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white py-3 rounded-xl font-medium transition-colors"
                >
                  {sending ? '전송 중...' : '전송'}
                </button>
              </div>
            )}
          </>
        )}

        {/* 내 정보 */}
        {myProfile && (
          <p className="text-center text-slate-600 text-xs">
            {myProfile.role === 'teacher' ? '👩‍🏫' : '👨‍🎓'} {myProfile.nickname || myProfile.name} 로 접속 중
          </p>
        )}
      </div>
    </div>
  )
}
