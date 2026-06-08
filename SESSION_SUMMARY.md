# AI Co-Teacher SESSION SUMMARY

## 프로젝트 기본 정보
- GitHub: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher
- 배포: https://ai-co-teacher-frontend.vercel.app
- 기술스택: Next.js 15, TypeScript, Tailwind, Supabase, Deepgram, OpenAI, ElevenLabs
- AI 선생님: Coty (코티)
- 현재 버전: v2026-06-08.3

## 오늘 세션(2026-06-08) 완료한 작업

### 1단계: DB 마이그레이션 v8 (완료)
- conversation_logs 교실 관련 14개 컬럼 추가
- classroom_sessions/answers/scenarios 컬럼 추가
- scenario_instructions, homework_logs 테이블 신규 생성

### 2단계: 학생 화면 통합 (완료)
- 로그인 시 active 세션 자동 참여 (팝업 제거)
- 좀비 세션 자동 종료 (updated_at 10분 무갱신)
- 대화 스트림 수업 시작/종료 구분선

### 3단계: 마이크 활성화 정책 (완료)
- student/classroom/page.tsx 전면 재작성
- mic_target Realtime 구독 (none/all/student_id)
- 스텝 타이머 + 전체 수업 타이머
- 재발화 요청 버튼
- 입장 시 Coty 환영 인사 TTS + 마이크 자동 활성화

### 버그 수정
- 선생님 화면 학생 접속 상태 미반영 (UPDATE 구독 추가)
- 좀비 세션으로 인한 의도치 않은 교실 진입

## 다음 할 일 (우선순위 순)

4단계: 수업 시간 관리
- ClassroomStartModal 수업 시간 입력 (기본 40분)
- 선생님/학생 화면 타이머 연동
- 시간 초과 시 팝업 후 4초 자동 다음 스텝

5단계: 재발화 정책
- 절반 이상 실패시 전체 재발화
- 하위 2명 자동 선정 개별 재발화

6단계: 시나리오 자동 생성 API
7단계: 선생님 화면 스텝 패널

## 주요 파일 경로
- frontend/app/(student)/page.tsx
- frontend/app/student/classroom/page.tsx (v8 전면 재작성)
- frontend/app/(teacher)/teacher/classroom/page.tsx
- frontend/components/teacher/ClassroomStartModal.tsx
- frontend/lib/version.ts (현재 v2026-06-08.3)
