# 교실 수업 통합 기획서 v8.0

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

### 학생 화면 = 하나의 화면
```
자습 중이든 수업 중이든 똑같은 화면
→ AI와 대화하는 단일 대화 스트림
→ 위로 스크롤하면 이전 자습/수업 내용 모두 보임
→ 달라지는 것: 상단 상태 표시 + 타이머 (수업 중만)
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
→ 하나의 대화 스트림으로 표시
→ 날짜/구분선으로만 구분
```

### AI는 항상 영어로
```
Coty는 기본적으로 영어로만 말함
학생 화면:
  → [🔊 재생] 다시 듣기
  → [영문 보기] 텍스트 확인
  → [해석 보기] 한국어 번역
선생님 화면:
  → [🔊 재생] 학생 목소리 듣기
```

---

## 2. 로그인 후 첫 화면 흐름

```
로그인
    ↓
수업 중인 세션 있나?
    ↓
┌─────────────────┬──────────────────┐
│  수업 중         │  수업 없음        │
└─────────────────┴──────────────────┘
        ↓                  ↓
   바로 수업 화면       교재 선택 화면
   (대화 스트림)            ↓
                    이전 Unit 있나?
                    ↓
          ┌─────────────┴──────────────┐
          │ 있음                       │ 없음
          ↓                           ↓
   "지난번에 ~하고               교재 목록만 표시
    있었어요"
   [이어서 하기 →]
   [다른 Unit 선택]
                    ↓
               자습 시작
               (대화 스트림)
```

### 교재 선택 화면

```
┌─────────────────────┐
│  📚 교재 선택        │
│                     │
│  지난번 학습:        │
│  Insight Builder 1  │
│  Unit 2             │
│  [이어서 하기 →]    │
│                     │
│  ── 다른 교재 ──    │
│  Insight Builder 1  │
│  Insight Builder 2  │
│  Power Up 1         │
└─────────────────────┘
```

---

## 3. 학생 화면 상세

### 단일 대화 스트림

```
┌─────────────────────┐
│  자습 중             │  ← 자습 시
│  Insight Builder 1  │
│  Unit 2             │
├─────────────────────┤
│  수업 중 Step 2/5   │  ← 수업 시
│  ⏱️ 6:24 / 8:45    │
│  ████████░░░ 75%    │
├─────────────────────┤
│  ↑ 위로 스크롤       │
│                     │
│ ── 2026-06-05 자습 ──│
│ Coty: "What is.."  │
│ 🔊 [영문] [해석]    │
│ 나: "It's a desk"✅ │
│ 🔊                  │
│                     │
│ ── 2026-06-06 자습 ──│
│ Coty: "Where is.." │
│ 나: "On the desk"✅ │
│                     │
│ 수업이 시작되어      │
│ 자습을 중단합니다    │
│                     │
│ ── 2026-06-06       │
│    수업 시작 ──      │
│ Coty: "Hi Minsu!"🔒│
│ 나: "Hello!"        │
│ Coty: "What is.."  │
│ 나: "It's a chair"✅│
│                     │
│ ── 2026-06-06       │
│    수업 종료 ──      │
│                     │
└─────────────────────┤
│      [🎤 말하기]     │
└─────────────────────┘
```

### 자습 vs 수업 UI 차이

| 항목 | 자습 | 수업 |
|------|------|------|
| 상단 표시 | "자습 중 + 교재/Unit" | "수업 중 Step N/N" |
| 타이머 | 없음 | ⏱️ 남은 시간 표시 |
| 대화 내용 | 동일 | 동일 |
| 마이크 버튼 | 동일 | 동일 (활성화 정책 적용) |

---

## 4. 마이크 버튼 활성화 정책 (확정)

### 기본 상태
```
모든 학생 마이크 버튼: 기본 비활성화
```

### 활성화 조건
```
1. AI가 개인에게 인사/질문 → 해당 학생만 활성화
2. AI가 전체에게 질문 → 모든 학생 동시 활성화
3. AI가 특정 학생에게 질문 → 해당 학생만 활성화
4. 학생 재발화 요청 + AI 허락 → 해당 학생만 활성화
```

### 전체 질문 시 답변 처리
```
Coty: "What is this?" (전체 질문)
    ↓
모든 학생 마이크 버튼 활성화
    ↓
각 학생이 자기 마이크 눌러서 답변
(순서 무관, 동시 가능)
    ↓
AI가 들어오는 순서대로 각자 분석
→ 각 학생 화면에 바로 피드백 표시
→ 선생님 화면에 실시간 답변 + 점수 표시
```

---

## 5. 재발화 정책 (확정)

### 절반 이상 실패 시
```
전체 답변 완료 후
실패(오답+무응답) ÷ 전체 > 50%
    ↓
전체 다시하기
Coty: "Let's try again everyone!"
→ 모든 학생 마이크 활성화
```

### 절반 미만 실패 시
```
하위 2명 재발화
선정 기준 (우선순위):
  1순위: 무응답자 (마이크 안 누른 학생)
  2순위: 오답 학생 (is_correct: false)
  3순위: 점수 낮은 순 (score 오름차순)

→ 2명을 순서대로 개별 재발화
Coty: "민수야, let's try again!"
→ 민수만 마이크 활성화 → 민수 답변
Coty: "지우야, your turn!"
→ 지우만 마이크 활성화 → 지우 답변
```

---

## 6. 수업 시간 관리 (확정)

### 수업 시작 시 설정
```
수업 총 시간: N분
스텝 수: 5개
→ 스텝당 초기 배분: N ÷ 5분
```

### 동적 시간 재배분
```
스텝이 일찍 끝나면:
→ 남은 시간을 나머지 스텝에 균등 재배분

스텝이 시간 초과하면:
→ 초과 시간을 나머지 스텝에서 균등 차감
```

### 시간 초과 시 동작
```
스텝 시간 초과
    ↓
선생님 + 학생 화면에 알림
┌─────────────────────────────┐
│  ⏰ Step 2 시간이 초과됐어요! │
│  4초 후 자동으로 다음 스텝   │
│  으로 넘어갑니다.            │
│  ████░░░░ 4초 카운트다운     │
│  [1분 더]  [지금 다음 스텝]  │
└─────────────────────────────┘
    ↓ 4초 후 응답 없으면
다음 스텝 자동 진행
```

### 타이머 표시

**선생님 화면**
```
┌────────────────────────────────────┐
│ Step 2/5   ⏱️ 6:24 / 8:45        │
│ ████████░░░░░░░ 75%               │
│ 전체 수업 남은 시간: 28:30         │
└────────────────────────────────────┘
```

**학생 화면**
```
┌─────────────────────┐
│ 수업 중 Step 2/5    │
│ ⏱️ 6:24 / 8:45     │
│ ████████░░░ 75%     │
└─────────────────────┘
```

---

## 7. 수업 시작 흐름

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
│ [미리보기/수정] │    │ AI가 자동으로          │
│ [바로 시작]     │    │ 만들겠습니다.          │
└─────────────────┘    │ [취소]  [확인 →]      │
        ↓              └──────────────────────┘
        ↓                      ↓ 확인
        ↓              "시나리오를 생성하고
        ↓               있습니다..." (10~20초)
        ↓              GPT 시나리오 자동 생성
        ↓                      ↓
        └──────────┬───────────┘
                   ↓
        시나리오 미리보기/수정 화면
                   ↓
        수업 시간 설정 (총 시간 입력)
                   ↓
        그리드 설정 (최대 10명, 5×2)
                   ↓
        [수업 시작]
                   ↓
        classroom_sessions 생성 (status: 'waiting')
                   ↓
        /teacher/classroom 진입
                   ↓
        학생 스마트폰 자동 수업 참여
```

---

## 8. 프리토킹 스텝 유형 5가지

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
- 단어 목록 전체 표시 (단어 + 한국어 뜻)
- Coty가 단어 하나씩 천천히 읽기
- 전체 학생 따라 말하기 → STT 수집
- 선생님 발음 확인 후 피드백
체크: 정확한 단어 발음
```

### 유형 2: 단어 K2E (word_k2e)
```
목표: 한국어 단어 보고 영어 단어 말하기
- 한국어 단어 하나씩 표시
- 전체 or 개인 마이크 활성화
- STT 채점 (expected_en 비교)
체크: 단어 인출 + 발음
```

### 유형 3: 문장 듣고 따라하기 (sentence_listen_repeat)
```
목표: 문장 발음/리듬 훈련
- target_pattern × target_words 조합
  (의미상 자연스러운 조합만, 패턴당 단어 3개)
- 문장 하나씩 천천히 읽기
- 전체 학생 따라 말하기
체크: 문장 발음 + 리듬 + 억양
```

### 유형 4: 문장 영작 K2E (sentence_k2e)
```
목표: 한국어 문장 → 영어로 말하기
- 한국어 문장 표시
- STT 채점 (expected_en + accept_variants)
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
- 정답/오답 판정 없이 대화 이어가기
- 전체/개인 메시지 구분
체크: 자연스러운 표현 활용
```

---

## 9. 선생님 화면

### 전체 레이아웃
```
┌──────────────────────────────────────────────────────┐
│  🏫 A반  Unit 1  Step 2/5  ⏱️6:24/8:45  28:30 남음  │
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

### 버튼 구성
```
입장 단계 (waiting):
[🚀 수업 시작]  [🔴 취소]

수업 중 (active):
[▶️ 다음 스텝]   ← 시나리오 순서대로
[📢 전체 피드백]
[🔴 수업 종료]
[로그아웃]

각 학생 칸:
[💬 학생 피드백]
```

---

## 10. 학생 무응답 처리

```
1회 무응답: 정상 (그냥 넘어감)

2회 연속 무응답:
→ 해당 학생 화면에 경고
  "Minsu, are you there? Please try! 💪"

3회 이상 무응답:
→ 선생님 화면에 알림
  "⚠️ 민수가 3번 연속 무응답입니다"
→ 다른 학생 화면에는 표시 안 함
```

---

## 11. 시나리오 자동 생성

### GPT 생성 스텝 순서
```
Step 1: word_listen_repeat
Step 2: word_k2e
Step 3: sentence_listen_repeat
Step 4: sentence_k2e
Step 5: free_talk
```

### 시나리오 재생성 규칙
```
[다시 생성] 클릭
→ 선생님이 추가 지침 입력 가능
→ 추가 지침은 scenario_instructions 테이블에 저장
→ 기존 시나리오 덮어쓰기
→ 미리보기 자동 표시
→ 재생성 → 미리보기 → 수정 반복 가능

같은 Unit 재수업:
→ 기존 시나리오 그대로 사용
→ 새로 만들려면 [시나리오 재생성] 버튼
```

### lesson_scenarios 구분
```sql
source: 'manual'        -- 수작업 생성
source: 'ai_generated'  -- GPT 자동 생성
```

---

## 12. 자동 처리 vs 수동 처리

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
| 절반 이상 실패 시 전체 재발화 | 자동 |
| 하위 2명 재발화 선정 | 자동 |
| 스텝 시간 초과 4초 후 진행 | 자동 |
| 동적 시간 재배분 | 자동 |
| 2회 무응답 경고 (학생 화면) | 자동 |
| 3회 무응답 알림 (선생님 화면) | 자동 |
| 전체 피드백 | 수동 (선생님 버튼) |
| 개인 피드백 | 수동 (선생님 버튼) |
| 스텝 전환 | 수동 (선생님 버튼) |
| 스텝 건너뜀 | 수동 (선생님 버튼 + 확인) |
| 스텝 반복 | 수동 (선생님 스텝 패널) |
| 수업 종료 | 수동 (선생님 버튼) |

---

## 13. DB 구조

### lesson_scenarios (수정)
```sql
ALTER TABLE lesson_scenarios
ADD COLUMN source text DEFAULT 'manual',
ADD COLUMN generated_at timestamptz,
ADD COLUMN generation_instructions text;
```

### scenario_instructions (신규)
```sql
CREATE TABLE scenario_instructions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid REFERENCES lesson_scenarios(id),
  teacher_id uuid REFERENCES profiles(id),
  instruction text,
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
  target_student_id uuid,         -- null: 전체 / id: 개인
  role text NOT NULL,             -- 'ai' | 'student'
  student_text text,
  ai_text text,
  audio_url text,                 -- 음성 파일 URL
  kr_sentence text,
  expected_en text,
  hint text,
  accept_variants jsonb,
  step_type text,
  is_correct boolean,
  score integer,
  attempt integer DEFAULT 1,
  feedback_kr text,
  mic_activated boolean,
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
  total_steps integer DEFAULT 5,
  lesson_duration_minutes integer DEFAULT 40,  -- 총 수업 시간
  step_durations jsonb,           -- 스텝별 배분 시간 (동적 재배분)
  status text DEFAULT 'waiting',
  coty_message text,
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
  audio_url text,
  is_correct boolean,
  score integer,
  issues text,
  feedback_kr text,
  no_response_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
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

## 14. 구현 우선순위

### 1단계 (즉시 구현)
```
1. 자습/수업 화면 통합
   - 로그인 시 수업 자동 참여
   - 교재 선택 화면 (이전 Unit 자동 표시)
   - 대화 스트림 통합 (자습/수업 구분선)

2. 마이크 버튼 활성화 정책
   - 기본 비활성화
   - AI 질문/인사 시만 활성화
   - 재발화 요청 기능

3. 수업 시간 관리
   - 스텝별 타이머
   - 동적 시간 재배분
   - 시간 초과 4초 자동 진행

4. 재발화 정책
   - 절반 이상 실패 시 전체 재발화
   - 하위 2명 자동 선정 (무응답→오답→낮은점수)

5. 시나리오 자동 생성 API
   - /api/classroom/generate-scenario
   - 미리보기/수정 화면

6. 선생님 화면 스텝 패널
   - 스텝 목록 + 상태
   - 반복/건너뜀/수정 버튼
```

### 2단계
```
7. 음성 파일 저장 (복습용)
8. 복습 기능 (숙제)
9. 수업 결과 리포트
10. 시나리오 재생성 지침 관리
```

### 3단계
```
11. 학부모 공유
12. 토큰 사용량 관리
13. 자동화 (조건 기반 자동 피드백/스텝 전환)
```

---

## 15. 향후 논의 사항

```
1. 학생 발화 피드백 방법
   → GPT? Deepgram? Azure?
   → 발음 정확도 측정 방식

2. 학생 음성 저장 비용
   → Supabase Storage vs AWS S3 vs Cloudflare R2

3. 학부모 수업 결과 공유
   → 공유 방법 (앱? 카카오? 이메일?)
   → 공유 내용

4. 학생별 토큰 사용량 관리
   → 기본 사용량 기준
   → 초과 시 결제 방식

5. 수업 결과 리포트
   → 선생님용 리포트 내용
   → 학생별 성취도 분석
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
