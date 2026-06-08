# AI Co-Teacher 인수인계서
**작성일**: 2026-06-07
**현재 버전**: v2026-06-06.34
**목적**: 새 창에서 바로 개발을 이어갈 수 있도록

---

## 새 창 시작 프롬프트

```
아래 파일들을 읽고 프로젝트 현황을 파악해줘:
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/SESSION_SUMMARY.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/CLAUDE.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/CHANGELOG.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/MODULE_MAP.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/WORKING_GUIDE.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/docs/classroom-v8-spec.md

GitHub: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher
Codespaces 경로: /workspaces/ai-co-teacher/
현재 버전: v2026-06-06.34

작업 방식:
- 코드 수정은 터미널 python3 스크립트로 직접 수정
- 수정 전 MODULE_MAP.md 반드시 참조
- 수정 후 cd frontend && npm run build 로 빌드 확인
- 빌드 성공하면 git add, commit, push
- 커밋 메시지에 버전 번호 포함
- frontend/lib/version.ts의 APP_VERSION도 함께 업데이트
```

---

## 지금 당장 개발할 것 (우선순위 순)

### 1단계: DB 수정 (Supabase SQL Editor에서 실행)

**conversation_logs 교실 필드 추가**
```sql
ALTER TABLE conversation_logs
ADD COLUMN IF NOT EXISTS classroom_session_id uuid REFERENCES classroom_sessions(id),
ADD COLUMN IF NOT EXISTS classroom_question_id uuid REFERENCES classroom_questions(id),
ADD COLUMN IF NOT EXISTS target_student_id uuid REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS audio_url text,
ADD COLUMN IF NOT EXISTS kr_sentence text,
ADD COLUMN IF NOT EXISTS expected_en text,
ADD COLUMN IF NOT EXISTS hint text,
ADD COLUMN IF NOT EXISTS accept_variants jsonb,
ADD COLUMN IF NOT EXISTS step_type text,
ADD COLUMN IF NOT EXISTS mic_activated boolean;
```

**classroom_sessions 시간 관련 필드 추가**
```sql
ALTER TABLE classroom_sessions
ADD COLUMN IF NOT EXISTS total_steps integer DEFAULT 5,
ADD COLUMN IF NOT EXISTS lesson_duration_minutes integer DEFAULT 40,
ADD COLUMN IF NOT EXISTS step_durations jsonb;
```

**classroom_answers 음성 URL 추가**
```sql
ALTER TABLE classroom_answers
ADD COLUMN IF NOT EXISTS audio_url text,
ADD COLUMN IF NOT EXISTS no_response_count integer DEFAULT 0;
```

**lesson_scenarios 자동생성 구분 추가**
```sql
ALTER TABLE lesson_scenarios
ADD COLUMN IF NOT EXISTS source text DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS generated_at timestamptz,
ADD COLUMN IF NOT EXISTS generation_instructions text;
```

**scenario_instructions 테이블 신규 생성**
```sql
CREATE TABLE IF NOT EXISTS scenario_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid REFERENCES lesson_scenarios(id),
  teacher_id uuid REFERENCES profiles(id),
  instruction text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE scenario_instructions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can all" ON scenario_instructions
FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE scenario_instructions;
```

**homework_logs 테이블 신규 생성**
```sql
CREATE TABLE IF NOT EXISTS homework_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES profiles(id),
  classroom_session_id uuid REFERENCES classroom_sessions(id),
  reviewed_at timestamptz DEFAULT now(),
  review_score integer,
  completed boolean DEFAULT false
);

ALTER TABLE homework_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated can all" ON homework_logs
FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

---

### 2단계: 학생 화면 통합
**파일**: `frontend/app/(student)/page.tsx`

구현할 것:
- 로그인 시 active 수업 세션 자동 감지 → 자동 참여
- 교재 선택 화면 (이전 Unit 자동 표시)
- 대화 스트림에 구분선 추가:
  - "수업이 시작되어 자습을 중단합니다"
  - ── 2026-06-07 수업 시작 ──
  - ── 2026-06-07 수업 종료 ──
- 수업 종료 후 교재 선택 화면으로 이동

---

### 3단계: 마이크 활성화 정책
**파일**: `frontend/app/(student)/page.tsx`
**관련**: `frontend/app/student/classroom/page.tsx`

구현할 것:
- 기본: 마이크 버튼 비활성화
- classroom_sessions.mic_target Realtime 구독
  - 'none' → 비활성화
  - 'all' → 전체 활성화
  - '{student_id}' → 해당 학생만 활성화
- 재발화 요청 버튼 추가

---

### 4단계: 수업 시간 관리
**파일**: `frontend/app/(teacher)/teacher/classroom/page.tsx`
**관련**: `frontend/components/teacher/ClassroomStartModal.tsx`

구현할 것:
- ClassroomStartModal에 수업 시간 입력 (기본 40분)
- 스텝별 타이머 (동적 재배분)
- 시간 초과 시 팝업 → 4초 후 자동 다음 스텝
- 선생님/학생 화면 타이머 표시

---

### 5단계: 재발화 정책
**파일**: `frontend/app/(teacher)/teacher/classroom/page.tsx`

구현할 것:
- 전체 답변 완료 시 자동 분석
- 절반 이상 실패 → 전체 재발화
- 하위 2명 자동 선정 (무응답→오답→낮은점수)
- 순서대로 개별 재발화 진행

---

### 6단계: 시나리오 자동 생성
**신규 파일**: `frontend/app/api/classroom/generate-scenario/route.ts`
**관련**: `frontend/components/teacher/ClassroomStartModal.tsx`

구현할 것:
- 교재 선택 시 시나리오 없으면 자동 생성 팝업
- GPT로 5가지 스텝 시나리오 자동 생성
- 미리보기/수정 화면
- lesson_scenarios에 source: 'ai_generated'로 저장

---

### 7단계: 선생님 화면 스텝 패널
**파일**: `frontend/app/(teacher)/teacher/classroom/page.tsx`

구현할 것:
- 좌측 스텝 패널 (완료/진행중/예정 상태)
- [🔄 반복] [⏭️ 건너뜀] 버튼
- [✏️ 시나리오 수정] 버튼

---

## 현재 구현된 것 (건드리지 말 것)

```
✅ 선생님 교실 화면 (/teacher/classroom)
✅ 학생 교실 화면 (/student/classroom)
✅ classroom_participants Realtime
✅ 학생 접속 팝업
✅ 세션 자동 종료 (sendBeacon)
✅ Coty 아바타 MP4 영상
✅ Dev Log 패널
```

---

## 기획서 참조

전체 설계 내용:
- `docs/classroom-v8-spec.md` ← 가장 중요
- `docs/LEARNING_SYSTEM_DESIGN.md` ← 자습 시스템

---

## 주요 파일 위치

```
학생 화면:     frontend/app/(student)/page.tsx (2034줄)
선생님 교실:   frontend/app/(teacher)/teacher/classroom/page.tsx
학생 교실:     frontend/app/student/classroom/page.tsx
시작 모달:     frontend/components/teacher/ClassroomStartModal.tsx
Coty 아바타:   frontend/components/student/CotyAvatar.tsx
버전:          frontend/lib/version.ts (현재 v2026-06-06.34)
환경변수:      frontend/.env.local
```

---

## Supabase 테이블 Realtime 활성화 현황

```
✅ classroom_sessions
✅ classroom_questions
✅ classroom_answers
✅ classroom_participants
❌ scenario_instructions (1단계에서 추가 필요)
```
