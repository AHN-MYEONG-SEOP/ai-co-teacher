# AI Co-Teacher SESSION SUMMARY
## 프로젝트 기본 정보
- GitHub: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher
- 배포: https://ai-co-teacher-frontend.vercel.app
- 기술스택: Next.js 15, TypeScript, Tailwind, Supabase, Deepgram, OpenAI, ElevenLabs
- AI 선생님: Coty (코티)
- 현재 버전: v2026-06-10.18

## 새 세션 시작 프롬프트
아래 파일들을 읽고 프로젝트 현황을 파악해줘:
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/SESSION_SUMMARY.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/CLAUDE.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/CHANGELOG.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/MODULE_MAP.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/WORKING_GUIDE.md
GitHub: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher
현재 버전: v2026-06-10.18

## 오늘(2026-06-10) 완료한 작업

### DB 마이그레이션
- sessions 테이블에 student_id, status 컬럼 추가
- lesson_progress 테이블에 class_id 컬럼 추가
- classes 테이블에 current_book, current_unit 컬럼 추가
- conversation_logs FK: sessions 테이블로 재설정

### 세션 설계 확정
- sessions.class_id=null, student_id=학생id → 개인 자습 세션
- sessions.class_id=반UUID, student_id=null → 교실 수업 세션 (status=on/off)

### 선생님 수업화면 재작성
- (teacher)/teacher/classroom/page.tsx → 자습화면 복사 후 수정
- ConfirmStartCard 상단에 반 선택 드롭다운 추가
- 반 선택시 sessions 조회/생성 + classes.current_book/unit 로드
- 대시보드 수업시작 버튼 → ClassroomStartModal 제거, 바로 /teacher/classroom 이동
- useSearchParams + Suspense로 URL session 파라미터 처리

### 학생 수업화면 재작성
- student/classroom/page.tsx 새로 작성
- conversation_logs Realtime 구독
- 수업 없으면 4초 후 안내 메시지

### ConversationMessage 타입 통합
- 선생님 수업화면 ChatMessage → ConversationMessage 교체
- 학생별 메시지 배열 자습화면과 동일 구조

### 디버그 패널
- 자습화면: 오른쪽 사이드 패널 (테이블/컬럼 출처 표시)
- 선생님 수업화면: 오른쪽 사이드 패널 (열기/닫기 가능)

### 학생 관리 수정 기능
- 이름/닉네임/이메일/비밀번호 수정 모달 추가
- /api/teacher/update-student API 신규 생성

## 다음 할 일 (우선순위 순)

### 1. 선생님 수업화면 반 선택 흐름 완성 (최우선)
- 현재 문제: ConfirmStartCard에 반 선택 드롭다운이 표시되는지 확인 필요
- teacherClasses 배열이 ConfirmStartCard에 전달되는지 확인
- lessonState=confirm 상태 진입 확인
- 반 선택 → sessions 조회/생성 → 교재 로드 → ConfirmStartCard 표시 흐름 완성

### 2. 교실 수업 흐름 완성
- 수업 시작 후 학생 수업화면과 Realtime 연동
- 선생님 화면에서 각 학생 창 표시
- pendingAnswers 완료시 다음 스텝 자동 진행

### 3. md 파일 업데이트
- CHANGELOG.md, MODULE_MAP.md 업데이트 필요

## 주요 파일 경로
- frontend/app/(student)/page.tsx — 자습화면 (2141줄, 기준 파일)
- frontend/app/(teacher)/teacher/classroom/page.tsx — 선생님 수업화면
- frontend/app/student/classroom/page.tsx — 학생 수업화면
- frontend/app/(teacher)/teacher/page.tsx — 선생님 대시보드
- frontend/store/classroomStore.ts — 교실 세션 전역 상태 (신규, 미사용)
- frontend/app/api/teacher/update-student/route.ts — 학생 정보 수정 API
- frontend/lib/version.ts — 현재 v2026-06-10.18

## 핵심 설계 원칙

### conversation_logs = 단일 진실 공급원
- 1 row = AI 발화(ai_text) + 학생 답변(student_text) 쌍
- session_type = START(입장) | classroom(수업)
- target_student_id = 메시지 대상 학생 id

### GPT 호출 위치
- 자습화면: 학생 기기 → /api/chat
- 교실 수업: 선생님 화면 → /api/chat (학생 답변 감지 후)
- TTS: 자습=학생 기기 / 교실=선생님 화면만

### lesson_progress
- 자습: student_id=학생id, class_id=null
- 교실: student_id=null, class_id=반id
