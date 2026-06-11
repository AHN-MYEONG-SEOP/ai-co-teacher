# AI Co-Teacher — SESSION SUMMARY
## 새 채팅방에서 이 파일을 업로드하면 이전 대화 내용을 이어갈 수 있습니다.

---

## 프로젝트 기본 정보
- GitHub: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher (public)
- 배포: https://ai-co-teacher-frontend.vercel.app
- 기술스택: Next.js 15, TypeScript, Tailwind, Supabase, Deepgram nova-2, GPT-4o-mini, ElevenLabs
- AI 선생님: Coty (코티)
- 현재 버전: v2026-06-11.11

---

## 오늘 세션(2026-06-11) 완료한 작업

### Speaking Assessment 설계 확정
- 3개 독립 화면:
  1. /assessment/teacher → 대형화면 + 컨트롤 (조작 전담 선생님)
  2. /assessment/student → 학생 말하기 화면 (공용 화면, 로그인 불필요)
  3. /assessment/vote   → 점수 입력 (선생님 1~5점, 학생 👍)
- 최종 점수: AI(60%) + 선생님평균(30%) + 좋아요(10%)
- 최종 순위 발표: AI점수 → [선생님점수반영] → [친구점수반영] 버튼으로 순차 공개
- 순위 변동 시 카드 위치 애니메이션

### DB 테이블 생성 완료 (Supabase SQL 실행)
- asm_sessions: session_key(날짜-시간), session_date, session_time, status, current_student_id, current_step, current_scenario_id
- asm_scenarios: scenario_key, session_id, class_id, title, book, unit, steps(jsonb), total_steps
- asm_results: result_key, session_id, scenario_id, student_id, step, target, spoken, words(jsonb), pronunciation, completeness, pacing, pausing, step_total, feedback_kr
- asm_teacher_scores: score_key, session_id, student_id, teacher_id, attitude, confidence, effort, comment
- asm_student_likes: like_key, session_id, from_student_id, to_student_id

### API 생성
- /api/asm/sessions  → 세션 생성/조회 (session_key로 중복 방지)
- /api/asm/scenarios → 시나리오 CRUD
- /api/asm/results   → GPT 채점 + DB 저장
- /api/deepgram-stt  → Deepgram HTTP Blob STT

### 컴포넌트/화면 생성
- AssessmentScenarioEditor.tsx → 시나리오 등록 (세션+시나리오 동시, 아코디언)
- AssessmentSessionList.tsx    → 세션 목록 (대기/진행/종료 구분)
- /assessment/student/page.tsx → 학생 말하기 화면 (useWebSpeech 재사용)

### 대시보드 탭 정리
- 수업: 🔴실시간 | 🏫교실수업 | 📝Speaking Assessment
- 학생: 👨‍🎓학생관리 | 👤페르소나 | 📋대화기록 | 📊학습이력
- 설정: 🏫반관리 | 👩‍🏫교사관리 | 🎬시나리오 | 📝Assessment시나리오

---

## 다음 세션에서 할 일 (우선순위)

1. /assessment/teacher 대형화면 + 컨트롤
   - 좌측: 학생 목록 (완료✅/진행중🎤/대기⬜)
   - 중앙: 실시간 랭킹 (상위5등) + 현재 학생 스텝별 진행
   - [시작] [다음학생] [종료] 버튼
   - Supabase Realtime 구독

2. /assessment/vote 점수 입력 화면
   - 선생님: 1~5점 (별점)
   - 학생: 👍 좋아요 1점
   - 현재 말하는 학생 자동 표시 (Realtime)
   - /api/asm/teacher-scores, /api/asm/student-likes API

3. /assessment/result 최종 순위
   - AI 점수만 표시
   - [선생님점수반영] 버튼 → 오른쪽에 컬럼 추가 + 순위 변동 애니메이션
   - [친구점수반영] 버튼 → 또 오른쪽에 컬럼 추가
   - 순위 변동 시 카드 위치 이동 애니메이션 (1등이 맨 위로)
   - 각 점수 상세 표시 (선생님 별점, 좋아요 개수)

---

## 주요 파일 경로

- frontend/app/(teacher)/teacher/page.tsx         - 교사 대시보드
- frontend/app/assessment/student/page.tsx         - 학생 말하기 화면 ✅
- frontend/app/assessment/teacher/page.tsx         - 대형화면 (미구현)
- frontend/app/assessment/vote/page.tsx            - 점수입력 (미구현)
- frontend/app/assessment/result/page.tsx          - 최종결과 (미구현)
- frontend/components/teacher/AssessmentScenarioEditor.tsx ✅
- frontend/components/teacher/AssessmentSessionList.tsx    ✅
- frontend/app/api/asm/sessions/route.ts           ✅
- frontend/app/api/asm/scenarios/route.ts          ✅
- frontend/app/api/asm/results/route.ts            ✅
- frontend/app/api/asm/teacher-scores/route.ts     (미구현)
- frontend/app/api/asm/student-likes/route.ts      (미구현)
- frontend/lib/version.ts                          - v2026-06-11.11
