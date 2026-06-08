# 교실 수업 통합 기획서 v7.0

**프로젝트**: AI Co-Teacher (Coty 선생님)
**작성일**: 2026-06-07
**상태**: 논의 완료, 구현 예정

---

## 1. 핵심 설계 원칙

### 수업 엔진은 하나
```
스텝 수업 = 사전에 만들어진 시나리오로 수업
프리토킹  = GPT가 즉석에서 시나리오 생성 후 동일 엔진으로 수업
차이점: 시나리오 생성 시점만 다를 뿐
수업 진행 방식은 완전히 동일
```

### 자습 화면 = 수업 화면 (통합)
```
더 이상 자습 모드 / 수업 모드 구분 없음
→ 하나의 화면에서 모든 학습 진행
→ 수업이 열리면 자동으로 수업 상태 전환
→ 수업이 없으면 자습 상태
→ 학생이 로그인하면 자동으로 수업 참여
   (수업 중인 경우)
```

### 선생님 화면 = 학생 화면의 축소판 모음
```
선생님 화면 = 모든 학생 화면을 N×N 그리드로 모아놓은 것
학생 화면 = 선생님 화면의 특정 학생 칸을 전체 화면으로 확대한 것
같은 컴포넌트(LessonCell), 크기만 다름
```

### 대화 기록 통합
```
자습 + 교실 수업 모두 → conversation_logs 테이블
session_type으로 구분 (study | classroom)
target_student_id로 전체/개인 메시지 구분
→ 학생 전체 발화 이력 한 곳에서 관리
```

### AI는 항상 영어로
```
Coty는 기본적으로 영어로만 말함
학생은 자기 화면에서:
  → [🔊 재생] 버튼으로 다시 듣기
  → [영문 보기] 버튼으로 텍스트 확인
  → [해석 보기] 버튼으로 한국어 번역 확인
선생님은 학생 화면에서:
  → [🔊 재생] 버튼으로 학생 목소리 듣기
```

---

## 2. 수업 시작 흐름

### 교재 선택 → 시나리오 확인

```
선생님 로그인 → /teacher → 교실 수업 탭
    ↓
반 선택 → 교재/Unit 선택
    ↓
lesson_scenarios 조회
    ↓
┌──────────────────┬──────────────────────┐
│  시나리오 있음    │  시나리오 없음         │
└──────────────────┴──────────────────────┘
        ↓                      ↓
┌─────────────────┐    ┌──────────────────────┐
│ ✅ 시나리오 있음 │    │ ⚠️ 시나리오가 없어요.  │
│ 5개 스텝        │    │ AI가 자동으로          │
│                 │    │ 만들겠습니다.          │
│ [미리보기/수정] │    │ [취소]  [확인 →]      │
│ [바로 시작]     │    └──────────────────────┘
└─────────────────┘             ↓ 확인
        ↓              "시나리오를 생성하고 있습니다..."
        ↓              (로딩 화면, 예상 소요: 10~20초)
        ↓              GPT 시나리오 자동 생성
        ↓              lesson_scenarios INSERT
        ↓                      ↓
        └──────────┬───────────┘
                   ↓
        시나리오 미리보기/수정 화면
```

### 시나리오 미리보기/수정 화면

```
┌─────────────────────────────────────────┐
│  📋 시나리오 미리보기                     │
│  Insight Builder 1 · Unit 1             │
│                                         │
│  Step 1: 단어 듣고 따라하기  [완료예정]   │
│  단어: desk, chair, board               │
│  [✏️ 수정]                               │
│                                         │
│  Step 2: 단어 K2E          [완료예정]    │
│  한국어: 책상 → desk                     │
│  [✏️ 수정]                               │
│                                         │
│  Step 3: 문장 듣고 따라하기  [완료예정]   │
│  [✏️ 수정]                               │
│                                         │
│  Step 4: 문장 영작          [완료예정]    │
│  [✏️ 수정]                               │
│                                         │
│  Step 5: 자유 대화          [완료예정]    │
│  [✏️ 수정]                               │
│                                         │
│  추가 지침 입력:                          │
│  [더 쉽게 / 더 어렵게 / 특정 단어 강조...] │
│                                         │
│  [🔄 다시 생성]  [💾 저장 후 수업 시작]   │
└─────────────────────────────────────────┘
```

### 시나리오 재생성 규칙

```
[다시 생성] 클릭
→ 선생님이 추가 지침 입력 가능
  ex) "더 쉽게 만들어줘"
      "desk, chair 단어를 더 강조해줘"
      "문장을 더 짧게"
→ 추가 지침은 DB에 저장 (scenario_instructions 테이블)
→ GPT가 지침 반영해서 재생성
→ 기존 시나리오 덮어쓰기
→ 미리보기 자동 표시
→ 재생성 → 미리보기 → 수정 → 재생성 반복 가능

같은 Unit 재수업 시:
→ 기존 시나리오 그대로 사용
→ 새로 만들려면 [시나리오 재생성] 버튼 클릭
```

---

## 3. 수업 진행 상세 흐름

### 입장 단계 (status: 'waiting')

```
학생 로그인 or 이미 로그인 상태
    ↓ 자동
수업 중인 세션 감지
    ↓ 자동 참여 (팝업 없이)
classroom_participants INSERT
    ↓ 자동
GPT → Coty 개인별 환영 인사 생성
"Hi Minsu! Welcome! Great to see you today! 🎉"
→ TTS 재생 (교실 스피커)
→ 해당 학생 화면에만 표시
→ 해당 학생 마이크 버튼 활성화
   (인사에 답할 수 있도록)
→ conversation_logs 저장

※ 늦게 들어온 학생
"Oh, Jiwoo is here! Welcome! We already started~ 😊"
```

### 수업 시작 (선생님 버튼)

```
선생님 [🚀 수업 시작] 클릭
    ↓
classroom_sessions UPDATE (status: 'active')
    ↓ 자동
GPT → Coty 전체 수업 시작 멘트
"Everyone is here! Let's start today's lesson!"
→ TTS 재생 → 모든 학생 화면 표시
→ conversation_logs 저장 (broadcast)
```

### 스텝 진행

```
선생님 화면 좌측 스텝 목록에서
현재 스텝 자동으로 진행 중 표시

각 스텝:
Coty가 스텝 내용 진행
    ↓
마이크 버튼 활성화 (전체 or 개인)
    ↓
학생 답변 → STT 수집
    ↓
선생님 화면 실시간 표시
    ↓
선생님 판단
  [📢 전체 피드백] or [💬 학생 피드백]
    ↓
[▶️ 다음 스텝] 클릭
```

---

## 4. 마이크 버튼 활성화 정책

### 기본 상태
```
모든 학생 마이크: 기본 비활성화 (버튼 비활성)
단, 마이크 하드웨어는 항상 준비 상태
```

### 활성화 조건

```
조건 1: AI가 개인에게 인사/질문
→ 해당 학생만 마이크 버튼 활성화

조건 2: AI가 전체에게 질문
→ 모든 학생 마이크 버튼 활성화

조건 3: AI가 특정 학생에게 질문
→ 해당 학생만 마이크 버튼 활성화

조건 4: 학생이 재발화 요청 + AI 허락
→ 해당 학생만 마이크 버튼 활성화
```

### 재발화 요청 흐름

```
학생이 [재발화 요청] 버튼 클릭
    ↓
선생님 화면에 표시
"민수가 다시 말하고 싶어해요"
    ↓
AI가 자동으로 허락 멘트
"Sure Minsu! Go ahead~ 😊"
    ↓
민수 마이크 버튼 활성화
    ↓
민수 발화 → STT → 채점
```

### 비활성화 시점

```
학생이 발화를 완료하면
→ 마이크 버튼 자동 비활성화
→ 다음 AI 질문 때까지 대기
```

---

## 5. 학생 무응답 처리

```
1회 무응답: 정상 (그냥 넘어감)

2회 연속 무응답:
→ 해당 학생 화면에 경고 메시지
  "Minsu, are you there? 
   Please try to answer! 💪"

3회 이상 무응답:
→ 선생님 화면에 알림 표시
  "⚠️ 민수가 3번 연속 무응답입니다"
→ 다른 학생 화면에는 표시 안 함
→ 선생님이 직접 관심 가지도록 유도
```

---

## 6. 수업 중 스텝 관리

### 선생님 화면 좌측 스텝 패널

```
┌─────────────────────────────────────────┐
│ 좌측 스텝 패널          메인 그리드      │
│                                         │
│ Step 1 ✅완료  │  ┌────┬────┬────┐      │
│ Step 2 ▶️진행중│  │민수 │지우 │현아 │      │
│ Step 3 ⬜예정  │  │    │    │    │      │
│ Step 4 ⬜예정  │  └────┴────┴────┘      │
│ Step 5 ⬜예정  │                         │
│                │                         │
│ [🔄 스텝반복]  │                         │
│ [⏭️ 스텝건너뜀]│                         │
│ [✏️ 시나리오수정]                        │
└─────────────────────────────────────────┘
```

### 스텝 건너뛰기

```
선생님 [⏭️ 스텝 건너뜀] 클릭
    ↓
확인 팝업:
"다음 스텝으로 건너뜁니다.
 [취소]  [확인]"
    ↓ 확인
현재 스텝 중단 → 다음 스텝으로 즉시 이동
```

### 스텝 반복

```
좌측 패널에서 원하는 스텝 버튼 클릭
→ 해당 스텝 즉시 다시 시작
→ 이전 답변 초기화
→ 학생 화면에 새 스텝 시작 알림
```

### 수업 중 시나리오 수정

```
선생님 [✏️ 시나리오 수정] 클릭
→ 시나리오 수정 화면 오버레이
  - 전체 수정 가능
  - 특정 스텝 선택 후 지침 입력 → 해당 스텝만 재생성
→ 수정 완료 후 수업 재개
```

---

## 7. 스텝 유형 5가지

### 전체 흐름

```
Step 1: word_listen_repeat     단어 듣고 따라하기
    ↓
Step 2: word_k2e               단어 K2E
    ↓
Step 3: sentence_listen_repeat 문장 듣고 따라하기
    ↓
Step 4: sentence_k2e           문장 영작
    ↓
Step 5: free_talk              자유 대화
```

### 유형 1: 단어 듣고 따라하기 (word_listen_repeat)

```
목표: 오늘 배울 단어 소개 + 발음 훈련

Coty 행동:
1. "Today we'll learn these words! Listen carefully!"
2. 단어 목록 전체 표시 (단어 + 한국어 뜻)
3. 단어 하나씩 천천히 읽기
4. "Now everyone, repeat after me!"
5. 전체 학생 마이크 활성화
6. 학생 따라 말하기 → STT 수집
7. 선생님 발음 확인 후 피드백

체크: 정확한 단어 발음
```

### 유형 2: 단어 K2E (word_k2e)

```
목표: 한국어 단어 보고 영어 단어 말하기

Coty 행동:
1. "Now I'll show Korean, you say English!"
2. 한국어 단어 하나씩 표시
3. 전체 or 개인 마이크 활성화
4. STT 채점 (expected_en 비교)
5. 선생님 피드백

체크: 단어 인출 + 발음
```

### 유형 3: 문장 듣고 따라하기 (sentence_listen_repeat)

```
목표: 문장 발음/리듬 훈련

Coty 행동:
1. "Now let's make sentences! Listen and repeat!"
2. target_pattern × target_words 조합
   (의미상 자연스러운 조합만, 패턴당 단어 3개)
3. 문장 하나씩 천천히 읽기
4. 전체 학생 마이크 활성화
5. STT 수집
6. 선생님 발음/리듬 확인 후 피드백

체크: 문장 발음 + 리듬 + 억양
```

### 유형 4: 문장 영작 K2E (sentence_k2e)

```
목표: 한국어 문장 → 영어로 말하기

Coty 행동:
1. "Look at Korean and say it in English!"
2. 한국어 문장 표시
3. 전체 or 개인 마이크 활성화
4. STT 채점 (expected_en + accept_variants)
5. 선생님 피드백

GPT 생성 JSON:
{
  "kr_sentence": "저것은 책상입니다.",
  "expected_en": "That is a desk.",
  "hint": "That is a ___.",
  "accept_variants": ["That's a desk.", "It's a desk."]
}

체크: 문장 구성 + 단어 선택 + 발음
```

### 유형 5: 자유 대화 (free_talk)

```
목표: 배운 내용 자연스럽게 활용

Coty 행동:
1. "Let's have a conversation!"
2. 배운 target_words, pattern 자연스럽게 활용
3. 학생 답변에 자연스럽게 반응
4. 정답/오답 판정 없이 대화 이어가기
5. 전체/개인 메시지 구분

체크: 자연스러운 표현 활용
```

---

## 8. 학생 화면 상세

### 통합 화면 구조

```
┌─────────────────────┐
│  A반 수업 중  3/5   │  ← 수업 중일 때
│  또는: 자습 중       │  ← 수업 없을 때
├─────────────────────┤
│  📚 오늘의 학습 목표  │
│  Words: desk...     │
│  Pattern: It's a __ │
├─────────────────────┤
│  ↑ 위로 스크롤       │
│                     │
│  ── 2026-06-04 ──  │
│  [단어] desk        │
│  🔊 영문 해석        │
│  나: desk ✅        │
│  🔊                 │
│                     │
│  ── 2026-06-06 ──  │
│  Coty: Hi Minsu! 🔒 │
│  🔊  [영문] [해석]   │
│  나: Hello! ✅      │
│  🔊                 │
│  [재발화 요청]       │
│                     │
└─────────────────────┤
│  [🎤 말하기] ← 활성/비활성
└─────────────────────┘
```

### 메시지별 버튼

```
Coty 메시지 하단:
  [🔊 재생]  [영문 보기]  [해석 보기]

학생 발화 하단:
  [🔊 내 발음 듣기]  [재발화 요청]
```

### 수업 종료 후 화면

```
┌─────────────────────┐
│  🎉 수업이 끝났어요!  │
│                     │
│  오늘 학습 결과:     │
│  정답: 8/10         │
│  발음: 85점         │
│                     │
│  [📖 복습하기]       │
│  [📚 새 Unit 공부]   │
└─────────────────────┘
```

---

## 9. 음성 저장 정책

### 저장 대상

```
저장 필요:
→ 학생 발화 음성 (복습, 선생님 재생용)
→ Coty TTS 음성 (복습용)

저장 불필요:
→ 중간 처리 오디오
```

### 저장 위치

```
Supabase Storage (현재)
→ 소규모 테스트용
→ 비용 예상: 학생 1명 × 수업 1회 ≈ 1~5MB

장기:
→ AWS S3 or Cloudflare R2 검토
→ 비용 최적화 필요
```

### conversation_logs 음성 URL 추가

```sql
ALTER TABLE conversation_logs
ADD COLUMN audio_url text;
-- 학생 발화 or Coty TTS 음성 파일 URL
```

---

## 10. 복습 기능

### 복습 = 숙제

```
수업 종료 후 [복습하기] 클릭
→ 오늘 수업 내용 그대로 재현
→ Coty와 1:1로 동일한 스텝 진행
→ 음성 재생 가능 (선생님/본인 발화)
→ 복습 완료 여부 DB 저장

복습 기록:
→ 선생님이 복습 여부 확인 가능
→ 학부모 리포트에 포함
```

### 복습 완료 추적

```sql
CREATE TABLE homework_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES profiles(id),
  classroom_session_id uuid REFERENCES classroom_sessions(id),
  reviewed_at timestamptz DEFAULT now(),
  review_score integer,
  completed boolean DEFAULT false
);
```

---

## 11. 선생님 화면 상세

### 전체 레이아웃

```
┌──────────────────────────────────────────────────────┐
│  🏫 A반  Insight Builder 1 · Unit 1  Step 2/5        │
│  🟢 접속: 6명  ✅ 3명  ❌ 2명  ⬜ 1명  ⚠️ 무응답: 1명│
├────────────┬─────────────────────────────────────────┤
│  스텝 패널  │  메인 그리드                             │
│            │                                         │
│ 1✅단어듣기│ ┌──────┬──────┬──────┬──────┐          │
│ 2▶️단어K2E │ │민수🟢│지우🟢│현아🟢│태양⬜│          │
│ 3⬜문장듣기│ │↕스크롤│↕스크롤│↕스크롤│      │          │
│ 4⬜문장영작│ │      │      │      │      │          │
│ 5⬜자유대화│ │책상✅ │chair✅│      │대기중│          │
│            │ │[💬]  │[💬]  │[💬]  │[💬]  │          │
│[🔄반복]    │ └──────┴──────┴──────┴──────┘          │
│[⏭️건너뜀]  │                                         │
│[✏️수정]    │  [▶️ 다음 스텝]  [📢 전체 피드백]        │
│            │  [🔴 수업 종료]  [로그아웃]               │
└────────────┴─────────────────────────────────────────┘
```

### 각 학생 칸

```
┌──────────────┐
│ 민수  🟢      │  ← 이름 + 접속 상태
│ ↕ 스크롤     │  ← 이전 수업 기록 포함
│────────────  │
│ 06-05        │  ← 이전 날짜
│ desk ✅      │
│────────────  │
│ 06-06 (오늘) │
│ 책상 → desk  │
│ "desk" ✅    │  ← 오늘 답변
│ 🔊           │  ← 학생 목소리 재생
│              │
│ [💬 피드백]  │
└──────────────┘
```

---

## 12. DB 구조 전체

### lesson_scenarios (수정)

```sql
ALTER TABLE lesson_scenarios
ADD COLUMN source text DEFAULT 'manual',
-- 'manual' | 'ai_generated'
ADD COLUMN generated_at timestamptz,
ADD COLUMN generation_instructions text;
-- 추가 지침 저장
```

### scenario_instructions (신규)

```sql
-- 시나리오 재생성 시 추가 지침 이력
CREATE TABLE scenario_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid REFERENCES lesson_scenarios(id),
  teacher_id uuid REFERENCES profiles(id),
  instruction text,               -- 추가 지침 내용
  created_at timestamptz DEFAULT now()
);
```

### conversation_logs (수정)

```sql
CREATE TABLE conversation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES profiles(id),
  session_type text NOT NULL,     -- 'study' | 'classroom'
  study_session_id uuid,
  classroom_session_id uuid REFERENCES classroom_sessions(id),
  classroom_question_id uuid REFERENCES classroom_questions(id),
  target_student_id uuid REFERENCES profiles(id),
  -- null: 전체 / student_id: 개인
  role text NOT NULL,             -- 'ai' | 'student'
  student_text text,
  ai_text text,
  audio_url text,                 -- 음성 파일 URL (복습용)
  kr_sentence text,               -- K2E 한국어
  expected_en text,               -- K2E 정답
  hint text,
  accept_variants jsonb,
  step_type text,
  is_correct boolean,
  score integer,
  attempt integer DEFAULT 1,
  feedback_kr text,
  mic_activated boolean,          -- 마이크 활성화 여부
  confidence real,
  latency_ms integer,
  grammar integer,
  fluency integer,
  vocabulary integer,
  overall integer,
  created_at timestamptz DEFAULT now()
);
```

### classroom_sessions (수정)

```sql
CREATE TABLE classroom_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES classes(id),
  teacher_id uuid REFERENCES profiles(id),
  scenario_id uuid REFERENCES lesson_scenarios(id),
  current_step integer DEFAULT 1,
  current_step_type text,
  status text DEFAULT 'waiting',  -- 'waiting'|'active'|'ended'
  coty_message text,
  coty_scene_kr text,
  kr_sentence text,
  expected_en text,
  hint text,
  accept_variants jsonb,
  hint_visible boolean DEFAULT false,
  mic_target text DEFAULT 'none', -- 'none'|'all'|'{student_id}'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### classroom_questions (수정)

```sql
CREATE TABLE classroom_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES classroom_sessions(id),
  step integer,
  step_type text,
  question_type text DEFAULT 'broadcast',
  -- 'broadcast'|'individual'|'feedback_all'|'feedback_individual'
  target_student_id uuid REFERENCES profiles(id),
  coty_message text,
  coty_scene_kr text,
  kr_sentence text,
  expected_en text,
  hint text,
  accept_variants jsonb,
  mic_target text DEFAULT 'none', -- 'none'|'all'|'{student_id}'
  created_at timestamptz DEFAULT now()
);
```

### classroom_answers (수정)

```sql
CREATE TABLE classroom_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES classroom_sessions(id),
  question_id uuid REFERENCES classroom_questions(id),
  student_id uuid REFERENCES profiles(id),
  student_name text,
  step integer,
  step_type text,
  attempt integer DEFAULT 1,
  student_text text,
  audio_url text,                 -- 학생 발화 음성 URL
  is_correct boolean,
  score integer,
  issues text,
  feedback_kr text,
  no_response_count integer DEFAULT 0, -- 무응답 횟수
  created_at timestamptz DEFAULT now()
);
```

### classroom_participants (수정)

```sql
CREATE TABLE classroom_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES classroom_sessions(id),
  student_id uuid REFERENCES profiles(id),
  student_name text,
  joined_at timestamptz DEFAULT now(),
  is_online boolean DEFAULT true,
  no_response_count integer DEFAULT 0, -- 누적 무응답 횟수
  UNIQUE(session_id, student_id)
);
```

### homework_logs (신규)

```sql
CREATE TABLE homework_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES profiles(id),
  classroom_session_id uuid REFERENCES classroom_sessions(id),
  reviewed_at timestamptz DEFAULT now(),
  review_score integer,
  completed boolean DEFAULT false
);
```

---

## 13. 자동 처리 vs 수동 처리

| 동작 | 처리 방식 |
|------|---------|
| 시나리오 없을 때 자동 생성 | 자동 (GPT) |
| 학생 로그인 시 수업 자동 참여 | 자동 |
| 학생 입장 환영 인사 | 자동 (Coty, 개인별) |
| 환영 인사 후 마이크 활성화 | 자동 (해당 학생만) |
| 수업 시작 멘트 | 자동 (버튼 클릭 후) |
| 전체 질문 시 마이크 활성화 | 자동 (전체) |
| 개인 질문 시 마이크 활성화 | 자동 (해당 학생) |
| 발화 완료 시 마이크 비활성화 | 자동 |
| 2회 무응답 경고 (학생 화면) | 자동 |
| 3회 무응답 알림 (선생님 화면) | 자동 |
| 전체 피드백 | 수동 (선생님 버튼) |
| 개인 피드백 | 수동 (선생님 버튼) |
| 스텝 전환 | 수동 (선생님 버튼) |
| 스텝 건너뛰기 | 수동 (선생님 버튼 + 확인) |
| 스텝 반복 | 수동 (선생님 스텝 패널) |
| 재발화 허락 | 자동 (학생 요청 시 AI 자동 허락) |
| 수업 종료 | 수동 (선생님 버튼) |

---

## 14. 향후 논의 사항

```
1. 학생 발화 피드백 방법
   → GPT가? Deepgram이? Azure가?
   → 발음 정확도 측정 방식

2. 학생 음성 저장 비용
   → Supabase Storage vs AWS S3 vs Cloudflare R2
   → 학생 1명 × 월 비용 산정 필요

3. 학부모 수업 결과 공유
   → 공유 방법 (앱? 카카오? 이메일?)
   → 공유 내용 (점수? 발화 음성? 영상?)

4. 학생별 토큰 사용량 관리
   → 기본 사용량 설정 기준
   → 초과 시 결제 방식

5. 수업 결과 리포트
   → 선생님용 리포트 내용
   → 학생별 성취도 분석
```

---

## 15. 구현 우선순위

### 즉시 구현 (수업에 당장 필요)
```
1. 자습/수업 화면 통합
2. 학생 로그인 시 자동 수업 참여
3. 마이크 버튼 활성화 정책
4. 재발화 요청 기능
5. 학생 무응답 경고/알림
6. 스텝 패널 (반복/건너뜀)
7. 시나리오 자동 생성 + 미리보기
```

### 2단계 구현
```
8. 음성 파일 저장 (복습용)
9. 복습 기능 (숙제)
10. 수업 결과 리포트
11. 시나리오 재생성 지침 관리
```

### 3단계 구현
```
12. 학부모 공유
13. 토큰 사용량 관리
14. 자동화 (조건 기반 자동 피드백/스텝 전환)
```

---

## 16. 자동화 로드맵

### 1단계 (현재): 수동 제어
```
선생님이 [다음 스텝] [전체 피드백] [학생 피드백] 수동 클릭
```

### 2단계 (중기): 반자동
```
AI가 제안 → 선생님이 승인
"학생 70% 답변 완료. 전체 피드백 줄까요?" → [OK] [Skip]
```

### 3단계 (궁극): 완전 자동
```
→ 학생 70% 답변 → 자동 전체 피드백
→ 특정 학생 2회 오답 → 자동 개인 피드백
→ 피드백 후 일정 시간 → 자동 다음 스텝
→ 선생님은 관찰만
```
