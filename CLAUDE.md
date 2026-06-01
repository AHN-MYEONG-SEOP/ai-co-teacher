# 🤖 AI Co-Teacher — Claude Code Development Guidelines

**This document is the absolute source of truth for the AI Co-Teacher project.**
Claude는 코드를 작성하거나 리팩토링하기 전에 반드시 이 지침을 전체 정독하고, 모든 규칙을 철저히 준수해야 합니다.

---

## 0. 문서 자동 업데이트 규칙 (최우선 준수)

Claude Code는 매 작업 완료 시 아래 규칙을 **자동으로** 따라야 합니다.
사용자가 별도로 요청하지 않아도 작업이 끝나면 반드시 실행하세요.

### 매 작업 완료 시 → CHANGELOG.md 자동 업데이트
```
1. 반영 완료된 파일은 "반영 필요한 파일들" 표에서 삭제
2. 새로 추가된 기능은 "최근 추가된 기능"에 추가
3. 발견된 버그나 주의사항은 "알려진 버그" 에 추가
4. 미결 사항이 해결되면 "현재 미결 사항"에서 삭제 또는 상태 업데이트
```

### 매 배포(main push) 시 → 버전 순번 갱신 (필수)
```
- frontend/lib/version.ts 의 APP_VERSION 갱신
- 형식: "YYYY-MM-DD.순번" (같은 날 재배포 시 순번 +1, 날짜 바뀌면 .1)
- NavBar 상단에 표시되어 학생/교사가 배포 반영 여부를 눈으로 확인
- **커밋 메시지 제목 끝에 `(v{APP_VERSION})` 붙이기** → Vercel 배포 목록에서 어느 버전인지 한눈에 확인
  - 예: `feat: 진행률 바 색상 변경 (v2026-06-01.3)`
```

### 아래 경우에만 → CLAUDE.md 자동 업데이트
```
- 새 DB 테이블 또는 컬럼 추가
- 새 API 엔드포인트 추가
- 대화 흐름(LessonPhase) 변경
- 기술 스택 변경
- 새로운 절대 금지 규칙 추가
```

> ⚠️ 위 규칙을 따르지 않으면 다음 작업 시 컨텍스트가 틀어져서 잘못된 코드가 생성될 수 있습니다.

---

## 1. Project Overview & Core Philosophy

- **프로젝트명**: AI Co-Teacher
- **목적**: 1개 반 최대 8명 규모의 오프라인 영어 학원에서 사용 가능한 **실시간 AI 말하기 코치** 시스템.
- **AI 선생님 이름**: Coty (코티 선생님)
- **핵심 가치**:
  - 극저지연(Low Latency) + 고정확도(High Accuracy) STT 인프라.
  - 현장 담임 선생님의 개별 피드백 및 관리 부하 감소.
  - 장기 운영 시 API 호출 비용 최소화 (온프레미스 Mac Mini M4 서버 중심 연산).

---

## 2. Technology Stack

| 영역 | 기술 | 비고 |
|------|------|------|
| Frontend | Next.js 15 (App Router), TypeScript strict | `frontend/` |
| Styling | Tailwind CSS | |
| 상태관리 | Zustand | `frontend/store/` |
| BaaS | Supabase (Auth, DB, Realtime) | |
| STT | Deepgram nova-2 (HTTP Blob) | 현재 구현 |
| STT Fallback | FastAPI + Whisper | Mac Mini M4 타겟 |
| TTS | ElevenLabs | TTS_PROVIDER=elevenlabs |
| LLM | OpenAI GPT-4o-mini | |
| 배포 | Vercel (Frontend), Mac Mini M4 (Backend) | |

---

## 3. Repository Structure

```
ai-co-teacher/
├── frontend/
│   ├── app/
│   │   ├── (student)/page.tsx
│   │   ├── (teacher)/teacher/page.tsx
│   │   ├── login/page.tsx
│   │   └── api/
│   │       ├── chat/route.ts
│   │       ├── tts/route.ts
│   │       ├── feedback/route.ts
│   │       ├── log/route.ts
│   │       ├── study-log/route.ts
│   │       ├── lesson-report/route.ts
│   │       ├── curriculum/route.ts
│   │       └── deepgram-token/route.ts
│   ├── components/
│   │   ├── ui/                  # shadcn/ui (수정 금지)
│   │   ├── student/
│   │   ├── teacher/
│   │   └── common/
│   ├── hooks/
│   │   ├── useWebSpeech.ts
│   │   ├── useMediaRecorder.ts
│   │   ├── useConversation.ts
│   │   ├── useStudentSession.ts
│   │   └── useCurriculum.ts
│   ├── store/
│   │   ├── audioStore.ts
│   │   └── uiStore.ts
│   ├── data/curriculum.json     # 506개 유닛 교재 데이터
│   ├── types/index.ts
│   └── lib/supabase.ts
│
├── backend/                     # FastAPI Whisper Fallback 서버
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── services/
│   │   ├── models/
│   │   └── core/config.py
│   └── requirements.txt
│
├── CLAUDE.md                    # 이 파일 (고정 지침)
└── CHANGELOG.md                 # 변경 이력 및 현재 상태
```

---

## 4. STT Architecture

### 현재 구현: Deepgram HTTP Blob

```
마이크 누름 → Web Audio 노이즈 제거
  ├── HighPass Filter (80Hz 이하 제거)
  ├── LowPass Filter (8kHz 이상 제거)
  └── DynamicsCompressor (소음 억제)
MediaRecorder 100ms 청크 누적
마이크 뗌 → Blob 합침 → Deepgram HTTP API (타임아웃 30초)
transcript + confidence + words 반환
빈 텍스트만 재시도, 나머지는 항상 GPT 전송
```

### 향후 구현: Hybrid Safety Mechanism (Mac Mini 전환 시)

1. **병렬 처리**: Web Speech API + MediaRecorder 항상 동시 실행
2. **Path A (confidence ≥ 0.85)**: Web Speech API 결과 채택 → Audio Blob 즉시 파기
3. **Path B (confidence < 0.85)**: Audio Blob → FastAPI Whisper 서버 전송
4. **실시간 자막**: 어느 경로든 끊김 없는 시각 피드백

> Safari/iOS에서 confidence 값 신뢰 불가 → 실측 후 0.85 임계값 조정 필요

---

## 5. Conversation Flow

### LessonPhase 상태 머신
```
greeting → weather → review → confirm_unit → study
```

| Phase | 설명 |
|-------|------|
| greeting | 날짜/요일/시간대 인사 + 날씨 질문 |
| weather | 날씨 답변 → 이전 Unit 복습 시작 |
| review | 이전 Unit 3문장씩 설명 + Q&A |
| confirm_unit | 오늘 Unit 확인 → Yes: study / No: 학생 요구 반영 |
| study | 교재 단어/패턴 기반 대화 + 진행률 측정 |

### GPT 지침 (기본 규칙 — 모든 phase 공통)
1. 최대 3문장, 의문문은 마지막 문장에만 1개
2. 한국어 사용 금지
3. 문맥 불일치 시 → 지적하고 같은 질문 다시
4. 가끔 한국어 → 영어 번역 질문

### 교재 수준별 언어 조절
- Phonics / Builder → 3-5단어 짧은 문장 (6-7세)
- Challenger → 간단한 문장 (8-9세)
- Explorer → 명확한 문장 (10-11세)
- Inventor+ → 중학생 수준

---

## 6. Database Schema

```sql
profiles (
  id uuid PK, role text, name text, nickname text, class_id uuid,
  tts_speed text, show_feedback boolean,
  current_book text, current_unit integer,
  mode text  -- 'study' | 'chat'
)

conversation_logs (
  id, session_id, student_id,
  student_text, ai_text,
  stt_path text, confidence float, latency_ms int,
  grammar int, fluency int, vocabulary int, overall int,
  correction text, tip text,
  hint_used boolean
)

study_logs (
  id, student_id, session_id,
  book text, unit integer, unit_title text,
  studied_at date
)

lesson_reports (
  id, student_id, session_id,
  studied_at date, seq integer,
  book text, unit integer, unit_title text,
  progress integer, total_turns integer, correct_turns integer,
  hint_used_count integer,
  avg_grammar int, avg_fluency int, avg_vocabulary int, avg_overall int,
  summary text, issues text
)

sessions (id, class_id, started_at, ended_at)
classes (id, teacher_id, name)
```

---

## 7. Curriculum Data

- **위치**: `frontend/data/curriculum.json` (232KB, 506 유닛)
- **레벨 순서**: Phonics → Insight Builder → Challenger → Explorer → Inventor → Innovator → Literacy Builder → Challenger → Explorer → Inventor → Innovator
- **구조**: `{ level_order, curriculum: { level: { book: { unit: { title, words, objectives, sentence_patterns, grammar } } } } }`

---

## 8. Key UI Features

| 기능 | 설명 |
|------|------|
| 마이크 버튼 | Push-to-Talk, 터치/마우스 이벤트 분리 |
| 힌트 보기 | 선택지 3개 표시 (클릭 불가, 보기만) |
| 번역 보기 | AI 메시지 한국어 번역 버튼 |
| 🔁 다시듣기 | AI 메시지 TTS 재생 |
| 진행률 바 | 마이크 위, study phase에서만 표시 |
| 피드백 카드 | 문법/유창성/어휘 점수 + 교정 + 팁 |
| hint_used | 힌트 보고 말했는지 DB 저장 |

---

## 9. Settings

| 설정 | 옵션 | DB 컬럼 |
|------|------|---------|
| AI 말하기 속도 | 느림/보통/빠름 | profiles.tts_speed |
| 발화 피드백 표시 | ON/OFF | profiles.show_feedback |
| 학습 교재 | Book/Unit | profiles.current_book/unit |

---

## 10. Coding Conventions

### TypeScript
- 파일명: 컴포넌트 `PascalCase.tsx`, 훅 `useCamelCase.ts`
- 상수: `UPPER_SNAKE_CASE`
- 타입: `interface` 우선, `type`은 Union/Intersection에만
- exports: named export, `export default`는 Next.js page에만

### Python
- 파일명: `snake_case.py`
- 타입 힌트 필수
- Pydantic 모델: `app/models/`에만

---

## 11. Absolute Rules (절대 금지)

```typescript
// ❌ 금지
const data: any = ...           // any 타입
console.log(...)                // console.log (logger 사용)
const apiKey = "sk-abc123..."   // API 키 하드코딩

// ❌ Audio Blob 미파기 (메모리 누수)
sendToGPT(text)  // blob 파기 없이

// ✅ 올바른 예
blobChunks.current = []  // 즉시 파기 후 전송
sendToGPT(text)
```

**패키지 금지**
- `en-ipa` — puppeteer 의존성으로 Vercel 빌드 오류
- `sampleRate` getUserMedia 강제 지정 — 모바일 호환성 문제

**Git**
- `.env`, `.env.local` 절대 커밋 금지
- 커밋 메시지: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:` prefix 필수

---

## 12. Environment Variables

```bash
# Frontend (.env.local)
NEXT_PUBLIC_SUPABASE_URL=https://izjbucrblpbfjawkdmhz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=dSBPNBQ40EIx8MT5ZFf6
TTS_PROVIDER=elevenlabs
NEXT_PUBLIC_WHISPER_SERVER_URL=http://localhost:8000

# Backend (.env)
OPENAI_API_KEY=...
WHISPER_BACKEND=openai
HOST=0.0.0.0
PORT=8000
ALLOWED_ORIGINS=http://localhost:3000,https://ai-co-teacher-frontend.vercel.app
```

---

## 13. Common Commands

```bash
# Frontend
cd frontend && npm run dev
npm run build && npm run lint

# Backend
cd backend
uvicorn app.main:app --reload --port 8000

# Turborepo
npx turbo dev
```

---

## 14. Deployment

- **Vercel**: https://ai-co-teacher-frontend.vercel.app
- **GitHub**: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher
- **브랜치**: main (push → 자동 배포)
- `tsconfig.json`: `"resolveJsonModule": true` 설정 완료

---

**문서 버전**: v2.1
**최종 수정**: 2026년 6월
