# AI Co-Teacher SESSION SUMMARY

## 프로젝트 기본 정보
- GitHub: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher
- 배포: https://ai-co-teacher-frontend.vercel.app
- 기술스택: Next.js 15, TypeScript, Tailwind, Supabase, Deepgram, OpenAI, ElevenLabs
- AI 선생님: Coty (코티)
- 현재 버전: v2026-06-08.10

## 오늘 세션(2026-06-08) 완료한 작업

### DB 마이그레이션
- conversation_logs 교실 관련 14개 컬럼 추가
- classroom_sessions mic_target/current_step_type/kr_sentence/expected_en/hint 컬럼 추가
- scenario_instructions, homework_logs 테이블 신규 생성
- sessions 테이블에 student_id, status 추가
- conversation_logs session_id 외래키 sessions 테이블로 재설정

### 세션 설계 확정
- sessions.class_id = null → 개인 자습 세션 (student_id = 학생id)
- sessions.class_id = 반UUID → 교실 수업 세션 (student_id = null, status = on/off)
- 학생 로그인 시 기존 개인 세션 재사용 (없으면 새로 생성)
- conversation_logs.session_id로 모든 대화 이력 관리

### 학생-선생님 화면 연동 구현
- 선생님 화면 [Coty 인사]/[전체 인사] 버튼 추가
- conversation_logs Realtime 구독으로 학생 화면 메시지 수신
- 학생 교실 화면 TTS 제거 (AI 음성은 선생님 화면에서만)
- sendCotyMessage: /api/chat __GREETING__ 형식, /api/log로 저장

### 버그 수정
- classroom_sessions RLS 정책 추가 (세션 생성 실패 오류 해결)
- conversation_logs session_id FK 오류 해결
- 좀비 세션 자동 종료 (updated_at 10분 무갱신)
- 선생님 화면 학생 접속 상태 미반영 수정

## 다음 할 일 (우선순위 순)

### 1. classroom_sessions → sessions 통합 (큰 작업)
- classroom_sessions 참조하는 12군데 코드를 sessions으로 변경
- classroom_participants, classroom_answers도 session_id 기준으로 변경
- classroom_sessions 테이블 제거

### 2. 교실 수업 흐름 완성
- 선생님 로그인 시 반 세션 생성/활성화 (sessions INSERT, status='on')
- 학생 로그인 시 반 세션 status='on' 감지 → 교실 진입
- 학생 교실 진입 시 conversation_logs INSERT (session_type='START')
- AI 환영 인사 → ai_text UPDATE
- AI 질문 시 전체 학생 수만큼 conversation_logs INSERT
- 학생 답변 → student_text UPDATE (환영 인사 답변도 START row에 넣음)
- 한 row = 한 번의 AI-학생 대화 쌍 (ai_text + student_text)
- 선생님 화면 각 학생 창 = 해당 학생 conversation_logs 표시

### 3. 학생 수업 화면 = 자습 화면 통합
- 소리만 없는 버전으로 자습화면 재사용
- "진행중인 수업이 없습니다" 4초 후 표시

## 주요 파일 경로
- frontend/app/(student)/page.tsx
- frontend/app/student/classroom/page.tsx (추후 자습화면과 통합 예정)
- frontend/app/(teacher)/teacher/classroom/page.tsx
- frontend/hooks/useStudentSession.ts (세션 재사용 로직 추가됨)
- frontend/lib/version.ts (현재 v2026-06-08.10)

## 새 세션 시작 프롬프트
아래 파일들을 읽고 프로젝트 현황을 파악해줘:
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/SESSION_SUMMARY.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/CLAUDE.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/CHANGELOG.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/MODULE_MAP.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/WORKING_GUIDE.md

GitHub: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher
현재 버전: v2026-06-08.10
