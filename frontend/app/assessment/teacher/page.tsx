'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface Student {
  id: string
  name: string
  nickname: string
  class_id: string
  class_name?: string
  status: 'waiting' | 'active' | 'done'
}

interface RankingRow {
  student_id: string
  student_name: string
  avg_pronunciation: number
  avg_completeness: number
  avg_pacing: number
  avg_pausing: number
  avg_total: number
  step_count: number
}

interface StepResult {
  step: number
  target: string
  spoken: string
  pronunciation: number
  completeness: number
  pacing: number
  pausing: number
  step_total: number
  feedback_kr: string
}

interface SessionInfo {
  id: string
  session_key: string
  session_date: string
  session_time: string
  status: string
  current_student_id: string | null
  current_step: number
  current_scenario_id: string | null
}

export default function AssessmentTeacherPage() {
  const [session, setSession] = useState<SessionInfo | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [ranking, setRanking] = useState<RankingRow[]>([])
  const [currentSteps, setCurrentSteps] = useState<StepResult[]>([])
  const [currentStudent, setCurrentStudent] = useState<Student | null>(null)
  const [totalSteps, setTotalSteps] = useState(0)
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [showTeacherScore, setShowTeacherScore] = useState(false)
  const [showFriendScore, setShowFriendScore] = useState(false)
  const [voters, setVoters] = useState<{id:string,name:string,role:string,teacher_score:number|null,likes:number}[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const sessionId = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('session_id') || ''
    : ''

  // 랭킹 계산
  const calcRanking = useCallback((results: any[], studentMap: Map<string, Student>) => {
    const map = new Map<string, any>()
    results.forEach(r => {
      if (!map.has(r.student_id)) {
        map.set(r.student_id, {
          student_id: r.student_id,
          student_name: studentMap.get(r.student_id)?.nickname || studentMap.get(r.student_id)?.name || r.student_id,
          pronunciations: [], completenesses: [], pacings: [], pausings: [], totals: [],
          step_count: 0
        })
      }
      const s = map.get(r.student_id)
      s.pronunciations.push(r.pronunciation)
      s.completenesses.push(r.completeness)
      s.pacings.push(r.pacing)
      s.pausings.push(r.pausing)
      s.totals.push(r.step_total)
      s.step_count++
    })

    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : 0

    return Array.from(map.values()).map(s => ({
      student_id: s.student_id,
      student_name: s.student_name,
      avg_pronunciation: avg(s.pronunciations),
      avg_completeness: avg(s.completenesses),
      avg_pacing: avg(s.pacings),
      avg_pausing: avg(s.pausings),
      avg_total: avg(s.totals),
      step_count: s.step_count,
    })).sort((a,b) => b.avg_total - a.avg_total)
  }, [])

  // 초기 데이터 로드
  const loadData = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      // 세션 정보
      const { data: sess } = await supabase
        .from('asm_sessions')
        .select('*')
        .eq('id', sessionId)
        .single()
      if (!sess) return
      setSession(sess)

      // 세션의 시나리오 → 반 목록
      const { data: scenarios } = await supabase
        .from('asm_scenarios')
        .select('*, classes(name)')
        .eq('session_id', sessionId)
      if (!scenarios?.length) return

      setTotalSteps(scenarios[0]?.total_steps || 0)

      // 반별 학생 목록
      const classIds = scenarios.map((s: any) => s.class_id).filter(Boolean)
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, name, nickname, class_id')
        .in('class_id', classIds)
        .eq('role', 'student')
        .order('name')

      const scenarioMap = new Map(scenarios.map((s: any) => [s.class_id, s]))
      const studentList: Student[] = (profilesData || []).map(p => ({
        id: p.id,
        name: p.name,
        nickname: p.nickname || p.name,
        class_id: p.class_id,
        class_name: (scenarioMap.get(p.class_id) as any)?.classes?.name || '',
        status: 'waiting' as const
      }))

      // 완료된 학생 표시
      const { data: results } = await supabase
        .from('asm_results')
        .select('*')
        .eq('session_id', sessionId)

      const doneStudents = new Set(
        (results || [])
          .filter((r: any) => {
            const sc = scenarioMap.get(
              studentList.find(s => s.id === r.student_id)?.class_id || ''
            ) as any
            return sc && r.step >= sc.total_steps
          })
          .map((r: any) => r.student_id)
      )

      const updatedStudents = studentList.map(s => ({
        ...s,
        status: doneStudents.has(s.id) ? 'done' as const
          : s.id === sess.current_student_id ? 'active' as const
          : 'waiting' as const
      }))
      setStudents(updatedStudents)

      const studentMap = new Map(updatedStudents.map(s => [s.id, s]))
      setRanking(calcRanking(results || [], studentMap))

      // 접속자 - 현재 테스트 학생 기준으로 투표 완료 여부
      const currentStudentId = sess.current_student_id
      if (currentStudentId) {
        // 선생님들: asm_teacher_scores에 row가 있으면 접속, score!=null 이면 완료
        const { data: tScores } = await supabase
          .from('asm_teacher_scores')
          .select('teacher_id, score')
          .eq('session_id', sessionId)
          .eq('student_id', currentStudentId)

        // 학생들: asm_student_likes에 row가 있으면 접속, reaction!=null 이면 완료
        const { data: sLikes } = await supabase
          .from('asm_student_likes')
          .select('from_student_id, reaction')
          .eq('session_id', sessionId)
          .eq('to_student_id', currentStudentId)

        const voterIds = new Set([
          ...(tScores || []).map((t:any) => t.teacher_id),
          ...(sLikes || []).map((s:any) => s.from_student_id),
        ])

        if (voterIds.size > 0) {
          const { data: voterProfiles } = await supabase
            .from('profiles')
            .select('id,name,nickname,role')
            .in('id', Array.from(voterIds))
          setVoters((voterProfiles || []).map((p:any) => ({
            id: p.id,
            name: p.nickname || p.name,
            role: p.role,
            teacher_score: (tScores || []).find((t:any) => t.teacher_id === p.id)?.score ?? null,
            likes: (sLikes || []).find((s:any) => s.from_student_id === p.id)?.reaction ? 1 : 0,
          })))
        } else {
          setVoters([])
        }
      }

      // 현재 학생 스텝 결과
      if (sess.current_student_id) {
        const cur = updatedStudents.find(s => s.id === sess.current_student_id)
        setCurrentStudent(cur || null)
        const curResults = (results || [])
          .filter((r: any) => r.student_id === sess.current_student_id)
          .sort((a: any, b: any) => a.step - b.step)
        setCurrentSteps(curResults)
      }
    } finally {
      setLoading(false)
    }
  }, [sessionId, calcRanking])

  useEffect(() => { loadData() }, [loadData])

  // Realtime 구독
  useEffect(() => {
    if (!sessionId) return
    const channel = supabase
      .channel('asm_teacher_' + sessionId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'asm_results',
        filter: 'session_id=eq.' + sessionId
      }, () => loadData())
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'asm_sessions',
        filter: 'id=eq.' + sessionId
      }, () => loadData())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [sessionId, loadData])

  // 학생 선택 (클릭 시)
  const handleClickStudent = (student: Student) => {
    if (student.status === 'done') return
    setSelectedStudent(student)
  }

  // 학생 시작 (시작 버튼 클릭 시)
  const handleSelectStudent = async (student: Student) => {
    if (!session) return
    const scenario = await supabase
      .from('asm_scenarios')
      .select('id, total_steps')
      .eq('session_id', sessionId)
      .eq('class_id', student.class_id)
      .single()

    await supabase.from('asm_sessions').update({
      current_student_id: student.id,
      current_step: 1,
      current_scenario_id: scenario.data?.id || null,
      status: 'active'
    }).eq('id', sessionId)

    setStudents(p => p.map(s => ({
      ...s,
      status: s.id === student.id ? 'active' : s.status === 'active' ? 'waiting' : s.status
    })))
    setCurrentStudent(student)
    setCurrentSteps([])
    setTotalSteps(scenario.data?.total_steps || 0)
  }

  // 다음 학생
  const handleNextStudent = async () => {
    const waitingIdx = students.findIndex(s => s.status === 'waiting')
    if (waitingIdx === -1) return
    // 현재 학생 완료 처리
    setStudents(p => p.map(s => ({
      ...s,
      status: s.status === 'active' ? 'done' : s.status
    })))
    await handleSelectStudent(students[waitingIdx])
  }

  // 세션 종료
  const handleEnd = async () => {
    if (!confirm('세션을 종료하시겠습니까?')) return
    await supabase.from('asm_sessions').update({ status: 'ended' }).eq('id', sessionId)
    window.location.href = '/assessment/result?session_id=' + sessionId
  }

  const scoreBar = (score: number) => {
    const w = Math.round(score)
    const color = score >= 90 ? 'bg-emerald-500' : score >= 70 ? 'bg-yellow-500' : 'bg-red-500'
    return (
      <div className="flex items-center gap-2 flex-1">
        <div className="flex-1 bg-slate-700 rounded-full h-2">
          <div className={`${color} h-2 rounded-full transition-all duration-500`} style={{width: w+'%'}} />
        </div>
        <span className="text-xs text-white w-8 text-right font-mono">{score}</span>
      </div>
    )
  }

  const medal = (i: number) => i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}`

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-white text-xl">로딩 중...</p>
    </div>
  )

  if (!session) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-red-400 text-xl">세션을 찾을 수 없습니다.</p>
    </div>
  )

  const doneCnt = students.filter(s => s.status === 'done').length
  const waitCnt = students.filter(s => s.status === 'waiting').length

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* 상단 헤더 */}
      <div className="bg-slate-900 border-b border-slate-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-white font-bold text-lg">📝 Speaking Assessment</h1>
          <span className="text-slate-400 text-sm">{session.session_date} {session.session_time}</span>
          <span className="text-slate-500 text-xs font-mono">{session.session_key}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-400">완료 {doneCnt}명 · 대기 {waitCnt}명</span>
          <button
            onClick={handleEnd}
            className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >■ 종료</button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 좌측: 학생 목록 */}
        <div className="w-52 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col">
          <div className="p-3 border-b border-slate-800">
            <p className="text-xs text-slate-400 font-medium">👥 학생 목록</p>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {students.map(s => (
              <button
                key={s.id}
                onClick={() => handleClickStudent(s)}
                disabled={s.status === 'done'}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  s.status === 'active' ? 'bg-emerald-700 text-white' :
                  s.status === 'done' ? 'bg-slate-800/50 text-slate-500 cursor-not-allowed' :
                  selectedStudent?.id === s.id ? 'bg-blue-700 text-white' :
                  'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span>{s.status === 'active' ? '🎤' : s.status === 'done' ? '✅' : '⬜'}</span>
                  <div>
                    <p className="font-medium">{s.nickname}</p>
                    <p className="text-xs opacity-60">{s.class_name}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
              {/* 시작 버튼 */}
              <div className="p-3 border-t border-slate-800">
                <button
                  onClick={() => selectedStudent && handleSelectStudent(selectedStudent)}
                  disabled={!selectedStudent || selectedStudent.status === 'done'}
                  className="w-full bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
                >
                  ▶ 시작
                </button>
              </div>
          {/* 다음학생 버튼 */}
          <div className="p-3 border-t border-slate-800">
            <button
              onClick={handleNextStudent}
              disabled={waitCnt === 0}
              className="w-full bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-medium transition-colors"
            >
              ⏭ 다음학생
            </button>
          </div>
        </div>

        {/* 중앙: 랭킹 + 현재 학생 진행 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 현재 학생 */}
          {currentStudent && (
            <div className="bg-slate-900 border border-emerald-700/50 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🎤</span>
                  <div>
                    <p className="text-white font-bold text-lg">{currentStudent.nickname}</p>
                    <p className="text-slate-400 text-xs">{currentStudent.class_name} · Step {currentSteps.length}/{totalSteps}</p>
                  </div>
                </div>
                <div className="w-32 bg-slate-800 rounded-full h-3">
                  <div
                    className="bg-emerald-500 h-3 rounded-full transition-all"
                    style={{width: totalSteps ? `${(currentSteps.length/totalSteps)*100}%` : '0%'}}
                  />
                </div>
              </div>

              {/* 스텝별 결과 */}
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {currentSteps.map(st => (
                  <div key={st.step} className="bg-slate-800 rounded-xl p-3 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-emerald-400 font-medium">✅ Step {st.step}</span>
                      <span className="text-yellow-400 font-bold">Avg: {st.step_total}</span>
                    </div>
                    <p className="text-slate-400">🗣️ "{st.spoken}"</p>
                    <div className="grid grid-cols-4 gap-1 text-[10px]">
                      <span className="text-slate-500">발음: <span className="text-white">{st.pronunciation}</span></span>
                      <span className="text-slate-500">완성: <span className="text-white">{st.completeness}</span></span>
                      <span className="text-slate-500">속도: <span className="text-white">{st.pacing}</span></span>
                      <span className="text-slate-500">쉼: <span className="text-white">{st.pausing}</span></span>
                    </div>
                    {st.feedback_kr && <p className="text-slate-400 italic">💬 {st.feedback_kr}</p>}
                  </div>
                ))}
                {currentSteps.length === 0 && (
                  <p className="text-slate-500 text-center py-4 text-sm">아직 완료된 Step이 없습니다</p>
                )}
              </div>
            </div>
          )}

          {/* 랭킹 */}
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4">
            <div className="mb-3">
              <p className="text-white font-medium mb-1">🏆 실시간 랭킹</p>
              <div className="flex gap-4 text-xs text-slate-500">
                <span>Pronun=발음</span>
                <span>Complete=완성도</span>
                <span>Pacing=속도</span>
                <span>Pausing=쉼</span>
                <span className="text-yellow-400">🏆=평균(순위결정)</span>
              </div>
            </div>

            {ranking.length === 0 ? (
              <p className="text-slate-500 text-center py-8 text-sm">아직 채점 결과가 없습니다</p>
            ) : (
              <div className="space-y-2">
                {ranking.map((r, i) => (
                  <div key={r.student_id} className={`rounded-xl p-3 ${i < 3 ? 'bg-slate-800' : 'bg-slate-800/50'}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-lg w-8">{medal(i)}</span>
                      <span className="text-white font-medium flex-1">{r.student_name}</span>
                      <span className="text-xs text-slate-400">{r.step_count}step</span>
                      <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg px-3 py-1">
                        <span className="text-yellow-400 font-bold text-lg">{r.avg_total}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="text-slate-500 mb-1">Pronun</p>
                        {scoreBar(r.avg_pronunciation)}
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1">Complete</p>
                        {scoreBar(r.avg_completeness)}
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1">Pacing</p>
                        {scoreBar(r.avg_pacing)}
                      </div>
                      <div>
                        <p className="text-slate-500 mb-1">Pausing</p>
                        {scoreBar(r.avg_pausing)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 우측: 접속자 패널 */}
        <div className="w-56 shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col">
          <div className="p-3 border-b border-slate-800">
            <p className="text-xs text-slate-400 font-medium">👋 점수 입력 참여자</p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            <div>
              <p className="text-xs text-slate-500 mb-2">👩‍🏫 선생님</p>
              <div className="space-y-1">
                {voters.filter(v => v.role === 'teacher').map(v => (
                  <div key={v.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-2 py-1.5">
                    <span className="text-slate-300 text-xs">{v.name}</span>
                    <span className="text-xs">{v.teacher_score !== null ? <span className="text-emerald-400">✅</span> : <span className="text-slate-500">⏳</span>}</span>
                  </div>
                ))}
                {voters.filter(v => v.role === 'teacher').length === 0 && <p className="text-slate-600 text-xs">아직 없음</p>}
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-2">👨‍🎓 학생</p>
              <div className="space-y-1">
                {voters.filter(v => v.role === 'student').map(v => (
                  <div key={v.id} className="flex items-center justify-between bg-slate-800 rounded-lg px-2 py-1.5">
                    <span className="text-slate-300 text-xs">{v.name}</span>
                    <span className="text-emerald-400 text-xs">👍{v.likes}</span>
                  </div>
                ))}
                {voters.filter(v => v.role === 'student').length === 0 && <p className="text-slate-600 text-xs">아직 없음</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
