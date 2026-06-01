# 🤖 AI Co-Teacher — Claude Code Development Guidelines

**This document is the absolute source of truth for the AI Co-Teacher project.**
Claude는 코드를 작성하거나 리팩토링하기 전에 반드시 이 지침을 전체 정독하고, 모든 규칙을 철저히 준수해야 합니다.

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
| TTS | ElevenLabs (Voice Cloning) | TTS_PROVIDER=elevenlabs |
| LLM | OpenAI GPT-4o-mini | |
| 배포 | Vercel (Frontend), Mac Mini M4 (Backend) | |
| 개발도구 | GitHub Codespaces, Turborepo | |

---

## 3. Repository Structure

```
ai-co-teacher/
├── frontend/
│   ├── app/
│   │   ├── (student)/page.tsx          # 학생 메인 화면
│   │   ├── (teacher)/teacher/page.tsx  # 교사 대시보드
│   │   ├── login/page.tsx              # 통합 로그인
│   │   └── api/
│   │       ├── chat/route.ts           # GPT 대화 (phase별)
│   │       ├── tts/route.ts            # ElevenLabs TTS
│   │       ├── feedback/route.ts       # 발화 피드백
│   │       ├── log/route.ts            # 대화 로그 DB 저장
│   │       ├── study-log/route.ts      # 학습 기록 저장
│   │       ├── lesson-report/route.ts  # 날짜별 학습 리포트
│   │       ├── curriculum/route.ts     # 교재 데이터 API
│   │       └── deepgram-token/route.ts # Deepgram 토큰 발급
│   ├── components/
│   │   ├── ui/                  # shadcn/ui (수정 금지)
│   │   ├── student/             # 학생 화면 전용
│   │   ├── teacher/             # 교사 대시보드 전용
│   │   └── common/              # 공통 컴포넌트 (NavBar 등)
│   ├── hooks/
│   │   ├── useWebSpeech.ts      # Deepgram HTTP STT + 노이즈 제거
│   │   ├── useMediaRecorder.ts  # 오디오 녹음
│   │   ├── useConversation.ts   # GPT+TTS+피드백+단계별 흐름
│   │   ├── useStudentSession.ts # 학생 인증+세션+설정
│   │   └── useCurriculum.ts     # 교재 데이터 훅
│   ├── store/
│   │   ├── audioStore.ts        # 음성 처리 상태
│   │   └── uiStore.ts           # UI 상태
│   ├── data/
│   │   └── curriculum.json      # 506개 유닛 교재 데이터
│   ├── types/index.ts
│   └── lib/supabase.ts
│
├── backend/                     # FastAPI Whisper Fallback 서버
│   ├── app/
│   │   ├── main.py
│   │   ├── api/                 # v1/stt, v1/health
│   │   ├── services/            # Whisper 추론 로직
│   │   ├── models/              # Pydantic 스키마
│   │   └── core/config.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── docs/
├── docker-compose.yml
├── turbo.json
└── CLAUDE.md                    # 이 파일
```

---

## 4. STT Architecture (핵심 구현)

### 현재 구현: Deepgram HTTP Blob

```
마이크 누름
    ↓
Web Audio 노이즈 제거 파이프라인
  ├── HighPass Filter (80Hz 이하 제거)
  ├── LowPass Filter (8kHz 이상 제거)
  └── DynamicsCompressor (소음 억제)
    ↓
MediaRecorder 100ms 청크 누적 (chunksRef)
    ↓
마이크 뗌 → Blob 합침
    ↓
Deepgram HTTP API 전송 (타임아웃 30초)
  model: nova-2, language: multi
    ↓
transcript + confidence + words(단어별) 반환
    ↓
빈 텍스트면 재시도, 나머지는 항상 GPT 전송
```

### 향후 구현: Hybrid Safety Mechanism (Path A/B)

> ⚠️ 현재는 Deepgram 단일 경로. Mac Mini 상용기 전환 시 아래 구조로 전환 예정.

1. **병렬 처리**: Web Speech API + MediaRecorder 항상 동시 실행
2. **Path A (confidence ≥ 0.85)**: Web Speech API 결과 채택 → Audio Blob 즉시 파기
3. **Path B (confidence < 0.85)**: Audio Blob → FastAPI Whisper 서버 전송
4. **실시간 자막**: 어느 경로든 끊김 없는 시각 피드백 제공

> Safari/iOS에서 confidence 값이 신뢰할 수 없으므로, 실측 후 0.85 임계값 조정 필요.

---

## 5. Conversation Flow (대화 흐름)

### LessonPhase 상태 머신

```
greeting → weather → review → confirm_unit → study
```

| Phase | 설명 |
|-------|------|
| greeting | 날짜/요일/시간대 인사 + 날씨 질문 (2문장) |
| weather | 날씨 답변 받고 → 이전 Unit 복습 시작 |
| review | 이전 Unit 내용 3문장씩 설명 후 Q&A |
| confirm_unit | 오늘 Unit 확인 → Yes: study, No: 학생 요구 반영 |
| study | 교재 단어/패턴 기반 대화 + 진행률 측정 |

### GPT 지침 (chat/route.ts systemContent)

**기본 규칙 (모든 phase 공통)**
1. 최대 3문장, 의문문은 마지막 문장에만 1개 반드시
2. 한국어 사용 금지
3. 문맥 불일치 시 → 지적하고 같은 질문 다시
4. 가끔 한국어 → 영어 번역 질문 (예: "How do you say '오늘 날씨가 맑아' in English?")

**교재 수준별 언어 조절**
- Phonics / Builder → 3-5단어 짧은 문장 (6-7세 수준)
- Challenger → 간단한 문장 (8-9세 수준)
- Explorer → 명확한 문장 (10-11세 수준)
- Inventor+ → 중학생 수준

**단계별 세부 지침**

[greeting]
- 날짜/요일 + 시간대(오전/오후/저녁)에 맞는 인사
- 오전 → "How's the weather this morning?"
- 오후/저녁 → "How was the weather today?"

[review]
- 지난번 Book과 Unit 반드시 언급
- Unit 내용을 3문장씩 끊어서 설명
- 중간 청크: 의문문 없이 설명만
- 마지막 청크 끝에만 의문문 1개

[confirm_unit]
- 지난 학습 기반으로 오늘 Book/Unit AI가 제시
- 학생이 다른 Unit 원하면 → 요구에 맞게 진행 + DB 업데이트
- 오늘 Unit 내용 3문장씩 설명 (마지막만 의문문)

[study]
- 교재 단어/패턴 중심 대화
- 틀리면 교정 후 재질문
- 맞으면 짧게 칭찬("Great!") 후 다음 질문

---

## 6. Database Schema (Supabase)

```sql
profiles (
  id uuid PK,
  role text,              -- 'student' | 'teacher'
  name text,
  nickname text,
  class_id uuid,
  tts_speed text,         -- 'slow' | 'normal' | 'fast'
  show_feedback boolean,
  current_book text,      -- 현재 학습 Book
  current_unit integer,   -- 현재 학습 Unit
  mode text               -- 'study' | 'chat' (현재 study만 사용)
)

conversation_logs (
  id, session_id, student_id,
  student_text, ai_text,
  stt_path text,          -- 'A' | 'B'
  confidence float,
  latency_ms int,
  grammar int, fluency int, vocabulary int, overall int,
  correction text, tip text,
  hint_used boolean,      -- 힌트 보고 말했는지 여부
  created_at timestamptz
)

study_logs (
  id, student_id, session_id,
  book text, unit integer, unit_title text,
  studied_at date, created_at timestamptz
)

lesson_reports (
  id, student_id, session_id,
  studied_at date,
  seq integer,            -- 같은 날 순번 (1, 2, 3...)
  book text, unit integer, unit_title text,
  progress integer,       -- 최종 진행률 %
  total_turns integer,
  correct_turns integer,
  hint_used_count integer,
  avg_grammar int, avg_fluency int, avg_vocabulary int, avg_overall int,
  summary text,           -- GPT 생성 요약
  issues text,            -- GPT 생성 주요 이슈
  created_at timestamptz, updated_at timestamptz
)

sessions (
  id, class_id,
  started_at timestamptz, ended_at timestamptz
)

classes (
  id, teacher_id uuid REFERENCES profiles(id),
  name text, created_at timestamptz
)
```

---

## 7. Curriculum Data

- **위치**: `frontend/data/curriculum.json`
- **크기**: 232KB, 506개 유닛
- **레벨 순서**: Phonics → Insight Builder → Insight Challenger → Insight Explorer → Insight Inventor → Insight Innovator → Literacy Builder → Literacy Challenger → Literacy Explorer → Literacy Inventor → Literacy Innovator

```json
{
  "level_order": ["Phonics", "Insight Builder", ...],
  "curriculum": {
    "Insight Builder": {
      "Insight Builder 1": {
        "1": {
          "unit": 1,
          "title": "School",
          "words": "backpack, book, chair...",
          "objectives": "Identifying things for school...",
          "sentence_patterns": "What is this? — It is a book.",
          "grammar": "..."
        }
      }
    }
  }
}
```

---

## 8. Key UI Features (학생 화면)

| 기능 | 설명 |
|------|------|
| 마이크 버튼 | Push-to-Talk, 터치/마우스 이벤트 분리 처리 |
| 힌트 보기 | AI 질문 후 선택지 3개 표시 (클릭 불가, 보기만) |
| 번역 보기 | AI 메시지 한국어 번역 버튼 |
| 🔁 다시듣기 | AI 메시지 TTS 재생 |
| 진행률 바 | 마이크 위 표시, study phase에서만 |
| 피드백 카드 | 학생 발화 아래 문법/유창성/어휘 점수 + 교정 + 팁 |
| hint_used | 힌트 보고 말했는지 DB 저장 |

---

## 9. Settings (⚙️ 설정 항목)

| 설정 | 옵션 | DB 컬럼 |
|------|------|---------|
| AI 말하기 속도 | 느림(0.75x) / 보통(1.0x) / 빠름(1.25x) | profiles.tts_speed |
| 발화 피드백 표시 | ON/OFF | profiles.show_feedback |
| 학습 교재 | Book/Unit 선택 (레벨별 그룹화) | profiles.current_book/unit |

---

## 10. Coding Conventions

### TypeScript (Frontend)

- **파일명**: 컴포넌트 `PascalCase.tsx`, 훅 `useCamelCase.ts`, 유틸 `camelCase.ts`
- **상수**: `UPPER_SNAKE_CASE` — 예: `CONFIDENCE_THRESHOLD = 0.85`
- **타입**: `interface` 우선, `type`은 Union/Intersection에만
- **exports**: named export. `export default`는 Next.js page에만

```typescript
// ✅ 올바른 예
export const CONFIDENCE_THRESHOLD = 0.85

export interface SpeechResult {
  text: string
  confidence: number
  path: 'A' | 'B'
}

export function useMicrophoneControl() { ... }
```

### Python (Backend)

- **파일명**: `snake_case.py`
- **타입 힌트**: 모든 함수에 필수
- **Pydantic 모델**: `app/models/`에만 위치

```python
from __future__ import annotations
from pydantic import BaseModel

async def transcribe_audio(audio_bytes: bytes, language: str = "en") -> STTResponse:
    ...
```

---

## 11. Absolute Rules (절대 금지)

```typescript
// ❌ 절대 금지
const data: any = ...           // any 타입 금지
console.log(...)                // console.log 금지 (logger 사용)
const apiKey = "sk-abc123..."   // API 키 하드코딩 금지
const url = "http://localhost"  // URL 하드코딩 금지

// Audio Blob — Path A 확정 후 반드시 파기
if (confidence >= CONFIDENCE_THRESHOLD) {
  // ❌ blob 미파기 → 메모리 누수
  sendToGPT(text)
}

// ✅ 올바른 예
if (confidence >= CONFIDENCE_THRESHOLD) {
  blobChunks.current = []  // 즉시 파기
  sendToGPT(text)
}
```

**Git 규칙**
- `.env`, `.env.local` 절대 커밋 금지
- 커밋 메시지: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:` prefix 필수

**패키지 금지 목록**
- `en-ipa` — puppeteer 의존성으로 Vercel 빌드 오류 발생
- `sampleRate` getUserMedia 강제 지정 금지 — 모바일 호환성 문제

---

## 12. Environment Variables

### Frontend (`frontend/.env.local`)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://izjbucrblpbfjawkdmhz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...
SUPABASE_SERVICE_ROLE_KEY=eyJh...
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=dSBPNBQ40EIx8MT5ZFf6
TTS_PROVIDER=elevenlabs
NEXT_PUBLIC_ENV=production
NEXT_PUBLIC_WHISPER_SERVER_URL=http://localhost:8000
```

### Backend (`backend/.env`)

```bash
OPENAI_API_KEY=sk-...
WHISPER_BACKEND=openai        # openai | local (상용기: local)
WHISPER_MODEL_SIZE=large-v3
HOST=0.0.0.0
PORT=8000
ALLOWED_ORIGINS=http://localhost:3000,https://ai-co-teacher-frontend.vercel.app
```

---

## 13. API Endpoints

### FastAPI Backend

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/v1/stt` | Audio Blob → 텍스트 변환 |
| GET | `/health` | 서버 상태 확인 |
| GET | `/api/v1/model-info` | Whisper 모델 정보 |

### Next.js API Routes

| Method | Endpoint | 설명 |
|--------|----------|------|
| POST | `/api/chat` | GPT 대화 (phase별) |
| POST | `/api/tts` | ElevenLabs TTS |
| POST | `/api/feedback` | 발화 피드백 |
| POST/GET | `/api/log` | 대화 로그 |
| POST/GET | `/api/study-log` | 학습 기록 |
| POST/GET | `/api/lesson-report` | 학습 리포트 |
| GET | `/api/curriculum` | 교재 데이터 |
| GET | `/api/deepgram-token` | Deepgram 토큰 |

---

## 14. Common Commands

### Frontend

```bash
cd frontend
npm run dev          # 개발 서버 (localhost:3000)
npm run build        # 프로덕션 빌드
npm run lint         # ESLint
npm run type-check   # TypeScript 타입 검사
```

### Backend

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
pytest tests/
```

### Turborepo

```bash
npx turbo dev        # 전체 dev 서버 병렬 실행
npx turbo build      # 전체 빌드
```

---

## 15. Deployment

- **Vercel URL**: https://ai-co-teacher-frontend.vercel.app
- **GitHub**: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher
- **브랜치**: main (push → 자동 배포)
- `tsconfig.json`에 `"resolveJsonModule": true` 설정 완료

---

## 16. Pending Files (반영 필요한 파일들)

아래 파일들이 `/mnt/user-data/outputs/`에 최신본으로 있으며 프로젝트에 반영 필요:

| 출력 파일 | 반영 경로 |
|-----------|-----------|
| page.tsx | frontend/app/(student)/page.tsx |
| useConversation.ts | frontend/hooks/useConversation.ts |
| useWebSpeech.ts | frontend/hooks/useWebSpeech.ts |
| useStudentSession.ts | frontend/hooks/useStudentSession.ts |
| useCurriculum.ts | frontend/hooks/useCurriculum.ts |
| chat-route.ts | frontend/app/api/chat/route.ts |
| log-route.ts | frontend/app/api/log/route.ts |
| study-log-route.ts | frontend/app/api/study-log/route.ts |
| lesson-report-route.ts | frontend/app/api/lesson-report/route.ts |
| curriculum-route.ts | frontend/app/api/curriculum/route.ts |
| feedback-route.ts | frontend/app/api/feedback/route.ts |
| teacher-page.tsx | frontend/app/(teacher)/teacher/page.tsx |
| NavBar.tsx | frontend/components/common/NavBar.tsx |
| uiStore.ts | frontend/store/uiStore.ts |
| audioStore.ts | frontend/store/audioStore.ts |
| index.ts | frontend/types/index.ts |
| curriculum.json | frontend/data/curriculum.json |

---

## 17. TBD (미결 사항)

| 항목 | 현재 상태 | 결정 시점 |
|------|-----------|-----------|
| Path A/B Hybrid STT | Deepgram 단일 경로로 운영 중 | Mac Mini 상용기 전환 시 |
| Confidence 임계값 | 0.85 (초기값, 현재 미사용) | iPad Safari 실측 후 조정 |
| ElevenLabs Voice Cloning | 기본 Voice ID 사용 중 | 학원 측 요구사항 기반 |
| 회화 모드 앱 분리 | 학습 모드 안정화 후 별도 앱으로 분리 예정 | 학습 모드 완성 후 |
| Mac Mini 로컬 전환 | API 비용 월 10만 원 초과 시 | 베타 결과 기반 |
| 8명 동시 접속 Queue | FastAPI 비동기 기본 활용 예정 | 부하 테스트 후 |
| 교사 대시보드 학생별 Book/Unit 지정 | 미구현 | 다음 스프린트 |

---

**문서 버전**: v2.0
**최종 수정**: 2026년 6월
