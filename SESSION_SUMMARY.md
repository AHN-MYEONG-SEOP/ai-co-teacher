# AI Co-Teacher — SESSION SUMMARY
## 새 채팅방에서 이 파일을 업로드하면 이전 대화 내용을 이어갈 수 있습니다.

---

## 읽어야 할 파일 순서

1. 이 파일 (SESSION_SUMMARY.md)
2. https://github.com/AHN-MYEONG-SEOP/ai-co-teacher 공유
3. "CLAUDE.md와 CHANGELOG.md 읽고 이어서 작업해줘" 라고 하면 됨

---

## 프로젝트 기본 정보

- GitHub: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher (public)
- 배포: https://ai-co-teacher-frontend.vercel.app
- 기술스택: Next.js 15, TypeScript, Tailwind, Supabase, Deepgram nova-2, GPT-4o-mini, ElevenLabs
- AI 선생님: Coty (코티) - CLAUDE.md 기준
- 대상: 오프라인 영어 학원 최대 8명
- 현재 버전: v2026-06-11.7

---

## 오늘 세션(2026-06-11) 완료한 작업

### 교사 교실 수업화면 버그 수정 (v2026-06-10.18~26)
- teacherClasses.length > 1 → > 0 수정 (반 1개일 때도 드롭다운 표시)
- handleSelectClass() 끝에 setLessonState('confirm') 추가
- CSS 오타 수정: text-lefttransition-colors → text-left transition-colors
- 교실 수업 탭 클릭 시 바로 /teacher/classroom 이동
- 반 1개 자동선택 후 수업화면 진입
- 선생님 이름+이메일 표시 (profiles 테이블 조회)
- 반 목록 Supabase 직접 쿼리 → /api/teacher/classes API로 교체 (RLS 문제 해결)
- 디버그 패널에 선생님/반 정보 추가

### 학생 일괄 등록 기능 (v2026-06-11.1~5)
- /api/teacher/bulk-create-students API 생성
- BulkStudentUpload.tsx 컴포넌트 생성
- 아이디에 @sda.ac 자동 추가 (개별/일괄 모두)
- 샘플 엑셀 다운로드 버튼
- /api/teacher/check-students API로 중복 아이디 미리보기 표시
- 학생관리 탭에 엑셀 일괄 등록 섹션 추가

### Speaking Assessment 기획 및 초기 구현 (v2026-06-11.6~7)
- Speaking Assessment 기획서 v1.0 작성 (Word 문서)
- lesson_scenarios 테이블에 scenario_type 컬럼 추가 (SQL 실행 완료)
- lesson_scenarios 테이블에 assessment_date 컬럼 추가 (SQL 실행 완료)
- assessment_results 테이블 생성 (SQL 실행 완료)
- AssessmentScenarioEditor.tsx 컴포넌트 생성
  - 교재 드롭다운 (curriculum.json)
  - Unit 드롭다운 + 직접 입력 토글
  - 평가 날짜 선택
  - Step 추가/삭제 (한국어 + 정답 영어문장)
  - 엑셀 일괄 등록 + 샘플 다운로드
- 대시보드 탭 그룹 정리:
  - 수업: 🔴 실시간 | 🏫 교실 수업 | 📝 Speaking Assessment
  - 학생: 👨‍🎓 학생관리 | 👤 페르소나 | 📋 대화기록 | 📊 학습이력
  - 설정: 🏫 반 관리 | 👩‍🏫 교사관리 | 🎬 시나리오 | 📝 Assessment 시나리오

---

## Speaking Assessment 설계 확정 내용

### 흐름
1. 선생님이 대시보드 → Speaking Assessment 클릭
2. Coty 환영 인사 TTS 1회 재생
3. 반 선택 → 학생 목록 → Unit 선택 → 시작
4. 한 명씩 순서대로: 한국어 표시 → 마이크 → Deepgram STT → GPT 즉시 채점
5. Step 완료마다 하단 랭킹 실시간 업데이트
6. 한 학생 모든 Step 완료 → 다음 학생
7. 전체 완료 → 최종 랭킹

### 채점 항목
- Pronunciation (발음): Deepgram 인식률 기반
- Completeness (완성도): 단어 누락/대체 여부
- Pacing (속도): 80~140 WPM = 100점
- Pausing (쉼): 0.4초 이상 공백 감점
- Avg = 4개 항목 누적 평균 → 순위 결정

### 랭킹 패널 (화면 하단 가로)
- 한 줄에 한 학생
- Pronun:92 ████ | Complete:98 ████ | Pacing:85 ███ | Pausing:80 ███ | 🏆 89
- Avg는 크고 굵게 강조
- 스텝 완료마다 누적 평균으로 실시간 업데이트

### 채점 카드 (화면 상단 누적)
- 완료된 Step: 한국어 + 학생 발화 텍스트 + 4개 점수 + Step Avg 카드로 쌓임

### DB
- assessment_results: student_id, scenario_id, session_id, step, target, spoken, words(jsonb), pronunciation, completeness, pacing, pausing, step_total, feedback_kr
- words[] (Deepgram 타임스탬프) 저장 → 나중에 재채점 가능
- Supabase Realtime으로 랭킹 실시간 업데이트

### 비용
- GPT-4o-mini, 스텝별 즉시 채점
- 50명 × 10 step = 약 35원
- 사실상 무료 수준

---

## 현재 미완성 작업 (다음 세션)

1. Speaking Assessment 메인 화면 (app/assessment/page.tsx)
2. /api/assessment/route.ts GPT 채점 API
3. RankingPanel.tsx 실시간 랭킹
4. StepResultCard.tsx 채점 결과 카드
5. Assessment 시나리오 목록/수정/삭제 UI

---

## DB 현황 (2026-06-11 기준)

### 추가된 컬럼/테이블
- lesson_scenarios.scenario_type text (study/class/assessment/dictation/reading/conversation)
- lesson_scenarios.assessment_date date
- assessment_results 테이블 (신규)

### 기존 테이블
- profiles: id, role, name, nickname, class_id, tts_speed, show_feedback, current_book, current_unit
- classes: id, teacher_id, name, current_book, current_unit
- lesson_scenarios: book, book_slug, unit, title, scenario_type, assessment_date, phases(jsonb), is_active
- lesson_progress: student_id, scenario_id, session_date, attempt, current_step, completed_steps, natural_steps
- assessment_results: student_id, scenario_id, session_id, step, target, spoken, words, pronunciation, completeness, pacing, pausing, step_total, feedback_kr

---

## 주요 파일 경로

- frontend/app/(student)/page.tsx              - 학생 자습화면
- frontend/app/(teacher)/teacher/page.tsx      - 교사 대시보드
- frontend/app/(teacher)/teacher/classroom/page.tsx - 교사 교실화면
- frontend/app/student/classroom/page.tsx      - 학생 교실화면
- frontend/app/assessment/page.tsx             - Speaking Assessment (미구현)
- frontend/components/teacher/AssessmentScenarioEditor.tsx - Assessment 시나리오 편집기
- frontend/components/teacher/BulkStudentUpload.tsx - 학생 일괄 등록
- frontend/app/api/teacher/bulk-create-students/route.ts
- frontend/app/api/teacher/check-students/route.ts
- frontend/app/api/assessment/route.ts         - GPT 채점 API (미구현)
- frontend/lib/version.ts                      - 현재 버전: v2026-06-11.7
