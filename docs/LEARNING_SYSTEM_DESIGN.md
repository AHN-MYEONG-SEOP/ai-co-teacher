> ⚠️ **이 문서는 설계 의도 문서입니다.**
> 실제 구현은 MODULE_MAP.md와 코드를 참조하세요.
> 마지막 동기화: v2026-06-06.34
> 크게 달라진 부분은 각 섹션에 변경 표시로 기록합니다.

---

# AI Co-Teacher: 학습 시스템 설계 v3.0

## 핵심 철학

```
학생이 오늘의 target words와 patterns를
스스로 말하게 만드는 것이 목표

페르소나는 목적이 아니라 도구:
→ 학생 관심사를 이용해서
→ 오늘 배울 단어/패턴이 나오는 상황을 만들고
→ 학생이 스스로 그 표현을 사용하게 유도
```

---

## 전체 흐름

```
학생 로그인
    ↓
① 페르소나 + 오늘 Unit 데이터 로드
    ↓
② GPT가 수업 시나리오 생성 (백그라운드)
    ↓
③ 수업 시작 (시나리오 기반 자연스러운 대화)
    ↓
④ 대화 중 페르소나 실시간 업데이트
    ↓
⑤ 진도율 실시간 업데이트 (3회 자연 사용 기준)
    ↓
⑥ 수업 종료 → lesson_report 저장
```

---

## ① 페르소나 시스템

### 자동 구축 방식
- 매 GPT 응답마다 학생 발화에서 새 정보 감지
- 즉시 DB 업데이트 (백그라운드)
- 별도 API 호출 없음 — 기존 GPT 응답에 포함

### GPT 응답에 persona_update 포함
```typescript
// chat/route.ts 응답 구조
{
  text: "Wow, soccer with your brother sounds fun!",
  translation: "...",
  choices: [...],
  nextPhase: "study",
  progress: 42,
  stage_progress: [...],

  // 새로 감지된 페르소나 정보 (없으면 omit)
  persona_update: {
    hobbies: { sports: ["soccer"] },
    family_members: { has_brother: true },
    free_facts: ["plays soccer after school with brother"]
  }
}
```

### 페르소나 항목 (Curriculum 기반)

| 항목 | 구조 예시 | 관련 Unit |
|------|-----------|-----------|
| family_members | `{ has_brother: true, family_size: 4, parent_jobs: ["teacher"] }` | Builder U2, Challenger U1 |
| school_life | `{ favorite_subject: "PE", grade: 3, activities: ["soccer team"] }` | Builder U1, Challenger U8 |
| food_preferences | `{ likes: ["pizza"], dislikes: ["vegetables"] }` | Builder U3, Challenger U11 |
| hobbies | `{ sports: ["soccer"], games: ["minecraft"], instruments: ["piano"] }` | Builder U2, Explorer U7 |
| nature | `{ has_pet: true, pet_type: "dog", favorite_animal: "dog" }` | Builder U3, Explorer U11 |
| appearance | `{ hair: "short", height: "tall", features: ["glasses"] }` | Challenger U3, U6 |
| personality | `{ disposition: "shy", confidence_level: 2, response_style: "short" }` | Challenger U2, Explorer U1 |
| daily_life | `{ wake_up: "early", exercise: "active", sleep_hours: 9 }` | Challenger U5, Explorer U7 |
| future | `{ dream_job: "soccer player", reason: "I love soccer" }` | Explorer U1, Inventor U2 |
| environment | `{ lives_near: "park", commute: "walk" }` | Challenger U5, Inventor U3 |
| learning_patterns | `{ weak_points: ["prepositions"], strong_points: ["vocabulary"], avg_score: 82 }` | 자동 집계 |
| free_facts | `["has a dog named Max", "favorite color is blue"]` | GPT 자유 추출 |

### 페르소나 성장 예시
```
Day 1:  { }
Day 7:  { hobbies: {sports: ["soccer"]},
          family_members: {has_brother: true},
          learning_patterns: {weak_points: ["prepositions"]} }
Day 30: { hobbies: {sports: ["soccer"], games: ["minecraft"]},
          food_preferences: {likes: ["pizza"], dislikes: ["vegetables"]},
          learning_patterns: {weak_points: ["prepositions"],
                              strong_points: ["vocabulary"]},
          personality: {disposition: "getting more confident"},
          free_facts: ["has a dog named Max", "favorite color is blue"] }
```

---

## ② 수업 전 시나리오 생성

### 핵심 원칙
```
✅ 매 수업마다 반드시 새로 생성 (절대 재사용 금지)
   이유:
   - 페르소나가 매일 업데이트됨
   - 어제 틀린 부분이 오늘 반영되어야 함
   - 같은 시나리오 반복 → 학생이 패턴 파악 → 학습 효과 감소
```

### 생성 시점
```
학생 로그인 직후 백그라운드에서 실행
→ 수업 시작 전 준비 완료
→ lesson_scenarios 테이블에 저장
```

### 시나리오 생성 프롬프트
```
You are preparing a personalized English lesson.

Student: ${nickname}
Persona: ${JSON.stringify(persona)}

Today's lesson: ${book}, Unit ${unit} - "${title}"
Target words: ${words}
Objectives: ${objectives}
Key patterns: ${sentence_patterns}

MOST IMPORTANT RULE:
Student must PRODUCE the target language, not just respond.
ALL target words must appear naturally FROM THE STUDENT.

Use these 5 techniques:

1. AI pretends not to know (학생이 설명하게)
   "I don't know about soccer. Can you explain?"

2. AI makes deliberate mistakes (학생이 교정하게)
   "Soccer players use hands, right?"
   → Student: "No! We use our feet!"

3. Role reversal (학생이 질문하게)
   "Now YOU ask ME about my family!"
   → Student practices question patterns

4. Give choices and let student lead (학생이 주도하게)
   "What should we talk about next?"

5. AI needs help (학생이 설명하게)
   "I have a photo but don't know who this is..."

Return JSON only:
{
  "opening": "날씨 + 페르소나 훅으로 시작",
  "bridge": "페르소나 주제 → 오늘 Unit 연결 방법",
  "stages": [
    {
      "type": "word",
      "target": "brother",
      "technique": "role_reversal",
      "setup": "Now ask me about MY family using Who is...?",
      "expected_student_output": "Who is he? - He is my brother.",
      "progress_weight": 15,
      "completion_criteria": { "min_uses": 3, "natural_only": true }
    },
    {
      "type": "pattern",
      "target": "Who is ~?",
      "pattern_core": "Who is",
      "valid_variations": ["Who is he", "Who is she", "Who is this", "Who is your"],
      "technique": "ai_pretends_not_to_know",
      "setup": "I have a family photo but I don't know who everyone is...",
      "expected_student_output": "Who is he? / Who is she? / Who is your dad?",
      "progress_weight": 20,
      "completion_criteria": { "min_uses": 3, "natural_only": true }
    }
  ],
  "student_initiative_moments": [
    {
      "timing": "after 3rd exchange",
      "ai_line": "Now it's YOUR turn! Ask me about my family.",
      "target_pattern": "Who is ~?"
    }
  ],
  "confusion_moments": [
    {
      "ai_mistake": "Soccer players use hands, right?",
      "target_correction": "No! We use our feet!",
      "target_word": "feet/legs"
    }
  ],
  "closing": "자연스러운 마무리 방법"
}
```

### 시나리오 활용 예시
```
Unit: Family / 페르소나: 축구 좋아함, 형 있음, 수줍음

AI: "Did you play soccer this morning?"          ← opening
학생: "Yes! With my brother!"
AI: "I don't know your brother.                  ← bridge
     Can you tell me about him?"
AI: "Ask me who is in MY photo!"                 ← role reversal
학생: "Who is he?"                               ← 패턴 직접 사용!
AI: "Your brother is shorter than you, right?"   ← deliberate mistake
학생: "No! He is taller than me!"                ← 교정하며 사용
AI: "Ask me 3 questions about MY family!"        ← student initiative
학생: "Who is she? Is she your mom? Is she tall?" ← 모든 패턴 자연스럽게!
```

---

## ③ 진도율 시스템

### 완료 기준
```
단어/패턴을 자연스럽게 3회 이상 사용 = 완료

카운트 되는 것:
✅ 스스로 생각해서 자연스럽게 말한 것
✅ 패턴 변형 인정 (Who is he? / Who is she? / Who is your dad? 모두 OK)
✅ 단어 변형 인정 (tall / taller / tallest 모두 OK)

카운트 안 되는 것:
❌ 힌트(choices) 보고 말한 것 → hint_used: true
❌ 선택지 버튼 클릭한 것
❌ AI가 직접 유도해서 따라 말한 것
```

### GPT가 매 응답마다 판단
```typescript
// chat/route.ts 응답에 포함
{
  text: "...",
  stage_progress: [
    {
      "target": "brother",        // 감지된 단어/패턴
      "used_form": "my brother",  // 실제 사용 형태
      "natural_use": true,        // 자연스럽게 사용했는지
      "hint_used": false          // 힌트 없이 말했는지
    }
  ]
}
```

### 진도율 계산 로직
```typescript
// useConversation.ts
stage_progress.forEach(({ target, natural_use, hint_used }) => {
  if (natural_use && !hint_used) {
    scenarioStages[target].current_count++
    scenarioStages[target].usage_log.push(used_form)

    // 3회 달성 시 완료
    if (scenarioStages[target].current_count >= 3) {
      scenarioStages[target].completed = true
      progress += scenarioStages[target].progress_weight
    }
  }
})
```

### 진도율 화면 표시
```
마이크 위 항상 표시:
📚 Insight Builder 1 · Unit 2    [████████░░] 75%

📊 버튼 탭 → 상세 모달:
┌─────────────────────────────┐
│ 📚 오늘의 학습 진행          │
│ Insight Builder 1            │
│ Unit 2 - Family              │
│                              │
│ [████████░░] 75%             │
│                              │
│ 단어 (4/6)                   │
│ brother  ✅ 3회               │
│ dad      ✅ 3회               │
│ mom      🔄 2회               │
│ sister   🔄 1회               │
│ tall     ⬜                   │
│ short    ⬜                   │
│                              │
│ 패턴 (1/2)                   │
│ Who is ~?   ✅ 3회            │
│   └ he / she / your dad      │
│ Is ~ tall?  🔄 1회            │
└─────────────────────────────┘
```

---

## ④ GPT 지침 (chat/route.ts)

### 기본 규칙
```
1. 최대 3문장, 의문문은 마지막 문장에만 1개
2. 한국어 사용 금지
3. 문맥 불일치 시 → 지적하고 같은 질문 다시
4. 매 3번 대화마다 반드시 학생에게 주도권 전환
5. target words/patterns는 학생 입에서 나와야 함
   (AI가 먼저 사용하지 말 것)
```

### 학생 주도 유도 규칙 (핵심)
```
Rule 1: AI Never Asks More Than 2 Questions in a Row
→ 2번 질문 후 반드시 역할 전환 "Now YOU ask ME!"

Rule 2: AI Pretends Not to Know Student's Topics
→ "I don't know about soccer. Can you teach me?"

Rule 3: AI Makes Deliberate Mistakes
→ 학생이 알 만한 것을 일부러 틀리게 말함

Rule 4: AI Needs Student's Help
→ "I have a photo but I don't know who this is..."

Rule 5: Give Student Choices
→ "Do you want to talk about food or sports?"
```

### 교재 수준별 언어 조절
```
Phonics / Builder  → 3-5단어 짧은 문장 (6-7세)
Challenger         → 간단한 문장 (8-9세)
Explorer           → 명확한 문장 (10-11세)
Inventor+          → 중학생 수준
```

### 시스템 프롬프트 구조
```
1. 기본 규칙 + 학생 주도 유도 규칙
2. 교재 수준별 언어 조절
3. 페르소나 주입
   "Student: ${nickname}
    Interests: ${hobbies}
    Family: ${family_members}
    Weak points: ${learning_patterns.weak_points}
    Known facts: ${free_facts}"
4. 시나리오 주입
   "Follow this scenario: ${scenario}
    Current stage: ${current_stage}
    Stay natural, don't force the script."
5. 진도 추적 지시
   "For each student response, include stage_progress
    and persona_update in your JSON response."
```

---

## ⑤ 교사 대시보드

### 반-교사-학생 연결 구조
```sql
-- 교사 로그인 후 본인 반 학생만 조회
SELECT p.* FROM profiles p
JOIN classes c ON p.class_id = c.id
WHERE c.teacher_id = '교사_uuid'
AND p.role = 'student'
```

### 탭 구성 (기존 teacher/page.tsx 수정)
```
[🔴 실시간] [📋 대화기록] [📊 학습이력] [👤 페르소나] [👨‍🎓 학생관리]
```

### 실시간 탭
```
반: 영어 A반 (3명 접속 중)

김민수  📚 IB1 U2-Family    [████░░] 75%
        brother✅ dad✅ mom🔄 sister🔄

이지원  📚 IB1 U1-School    [██░░░░] 40%
        backpack✅ book🔄

박서준  📚 IC1 U1-School    [█████░] 85%
        거의 완료!
```

### 학습이력 탭
```
[전체] [김민수] [이지원] [박서준]

날짜         Book/Unit            진도   점수  힌트
2026-06-01  IB1 U2 Family        75%    82    2회
2026-05-31  IB1 U1 School       100%    90    0회
```

### 페르소나 탭 (신규)
```
[김민수] 페르소나 카드

관심사:  ⚽ 축구  🎮 마인크래프트  🍕 피자
가족:    형 있음 / 4인 가족
취약점:  전치사
강점:    어휘, 문장 패턴
성향:    처음엔 수줍었으나 점점 활발해지는 중
꿈:      축구선수
알려진 사실: 강아지 있음, 파란색 좋아함
마지막 업데이트: 2026-06-01
```

---

## ⑥ 파일 구조

### 새로 만들 파일
```
frontend/app/api/persona/route.ts
  GET  → 페르소나 조회
  POST → 페르소나 업데이트 (merge)

frontend/app/api/lesson-scenario/route.ts
  GET  → 시나리오 조회
  POST → 시나리오 생성 (로그인 시 호출)
```

### 수정할 파일
```
frontend/app/api/chat/route.ts
  → 시나리오 기반 GPT 지침으로 전면 교체
  → 페르소나 시스템 프롬프트 주입
  → persona_update + stage_progress 응답에 포함

frontend/hooks/useConversation.ts
  → 시나리오 상태 관리 추가
  → persona_update 수신 시 /api/persona 호출
  → stage_progress 기반 진도율 계산

frontend/hooks/useStudentSession.ts
  → 로그인 시 페르소나 로드
  → /api/lesson-scenario 호출 (백그라운드)

frontend/app/(student)/page.tsx
  → 📊 버튼 추가
  → 진행 상황 모달 추가

frontend/app/(teacher)/teacher/page.tsx
  → 본인 반 학생만 조회
  → 실시간 탭에 진행률 추가
  → 페르소나 탭 추가
```

---

## ⑦ 구현 순서

```
1단계: DB 테이블 생성
  learning_system_schema.sql 실행
  → student_personas
  → lesson_scenarios

2단계: 페르소나 API
  /api/persona/route.ts 생성

3단계: 시나리오 API
  /api/lesson-scenario/route.ts 생성

4단계: chat/route.ts 전면 업데이트
  → 시나리오 기반 지침
  → 페르소나 주입
  → persona_update + stage_progress 반환

5단계: useConversation.ts 업데이트
  → 시나리오 상태 관리
  → 진도율 계산

6단계: 학생 화면 (page.tsx)
  → 📊 버튼 + 진행 상황 모달

7단계: 교사 대시보드 (teacher/page.tsx)
  → 반별 학생 조회
  → 실시간 진행률
  → 페르소나 탭
```

---

## ⑧ DB 스키마 요약
(상세 내용은 learning_system_schema.sql 참조)

```sql
-- 학생 페르소나
student_personas (
  student_id uuid UNIQUE,
  family_members jsonb,
  school_life jsonb,
  food_preferences jsonb,
  hobbies jsonb,
  nature jsonb,
  appearance jsonb,
  personality jsonb,
  daily_life jsonb,
  future jsonb,
  environment jsonb,
  learning_patterns jsonb,
  free_facts text[]
)

-- 수업 시나리오
lesson_scenarios (
  student_id uuid,
  book text, unit integer,
  scenario jsonb,          -- GPT 생성 시나리오
  persona_snapshot jsonb,  -- 생성 시 페르소나 스냅샷
  status text,             -- ready/used/expired
  expires_at timestamptz   -- 24시간 후 만료
)
```

---

**문서 버전**: v3.0
**최종 수정**: 2026년 6월
