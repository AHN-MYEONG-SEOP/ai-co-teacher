# 🤖 Claude Code Development Guidelines: AI Co-Teacher

**This document is the absolute source of truth for the AI Co-Teacher project.**
Claude는 코드를 작성하거나 리팩토링하기 전에 반드시 이 지침을 전체 정독하고, 모든 규칙을 철저히 준수해야 합니다.

---

## 1. Project Overview & Core Philosophy

- **프로젝트명**: AI Co-Teacher
- **목적**: 1개 반 최대 8명 규모의 오프라인 영어 학원에서 사용 가능한 **실시간 AI 말하기 코치** 시스템.
- **핵심 가치**:
  - 극저지연(Low Latency) + 고정확도(High Accuracy) 하이브리드 STT 인프라 구축.
  - 현장 담임 선생님의 개별 피드백 및 관리 부하 감소.
  - 장기 운영 시 API 호출 비용 최소화 (온프레미스 Mac Mini M4 서버 중심 연산).

### 🎙️ Hybrid Safety Mechanism (절대 준수 규칙)

모든 음성 입력 처리 및 라우팅 시 반드시 다음의 4단계 룰을 예외 없이 구현해야 합니다:

1. **병렬 음성 처리 (Parallel Processing)**: 학생이 마이크 버튼을 누르고 발화를 시작하면 `Web Speech API`와 `MediaRecorder API`는 **항상 동시에 병렬**로 실행되어야 한다.
2. **Path A (신뢰도 충족)**: Web Speech API 결과의 신뢰도 점수(`confidence`)가 **0.85 이상**인 경우, 즉시 해당 텍스트를 채택하여 Next.js를 통해 OpenAI GPT-4o-mini로 전송한다. 이때 백업용으로 녹음되던 브라우저 메모리 내의 **Audio Blob은 즉시 파기(삭제)**한다.
3. **Path B (Fallback 가동)**: Web Speech API 결과의 `confidence`가 **0.85 미만**이거나 음성 인식 자체가 실패한 경우, 즉시 우회 경로를 활성화한다. `MediaRecorder`로 저장된 **Audio Blob을 백엔드 FastAPI Whisper 서버로 전송**하고, Whisper의 정밀 보정 처리 결과를 최종 텍스트로 사용하여 GPT-4o-mini로 넘긴다.
4. **실시간 시각 피드백**: 어떤 경로(Path A/B)로 라우팅되든 상관없이, 학생 화면에는 끊김 없는 **실시간 자막 시각 피드백**이 최우선으로 제공되어야 한다.

> ⚠️ **주의**: Web Speech API의 `confidence` score는 브라우저마다 구현이 다르다. 특히 **Safari/iOS에서는 신뢰할 수 없는 값이 반환될 수 있으므로**, 초기 개발 시 실측 테스트 후 임계값 조정이 필요하다. 0.85는 초기값이며 변경될 수 있다.

---

## 2. Technology Stack

| 영역 | 기술 | 비고 |
|------|------|------|
| Frontend | Next.js 15 (App Router), TypeScript strict | `frontend/` |
| Styling | Tailwind CSS + shadcn/ui + lucide-react | |
| 상태관리 | Zustand | `frontend/store/` |
| BaaS | Supabase (Auth, DB, Realtime) | |
| Backend | Python 3.11+, FastAPI, Uvicorn | `backend/` |
| STT (개발기) | OpenAI Whisper API | Path B Fallback |
| STT (상용기) | whisper.cpp (Metal 가속) | Mac Mini M4 타겟 |
| TTS (개발기) | OpenAI TTS (Alloy, Nova) | |
| TTS (상용기) | ElevenLabs (Voice Cloning) | |
| LLM | OpenAI GPT-4o-mini | |
| 배포 | Vercel (Frontend), Mac Mini M4 (Backend) | |
| 개발도구 | GitHub, Docker Compose, Turborepo | |

---

## 3. Repository Structure (Monorepo Architecture)

Claude는 파일 또는 컴포넌트를 생성할 때 반드시 아래의 구조 규칙을 준수하여 올바른 네이밍스페이스에 배치해야 합니다.

```text
ai-co-teacher/
├── frontend/                    # Next.js 15 앱
│   ├── app/
│   │   ├── (student)/           # 학생용 UI 라우트 그룹
│   │   ├── (teacher)/           # 교사용 대시보드 라우트 그룹
│   │   ├── api/                 # Next.js API Routes (Proxy, OpenAI 연동)
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                  # shadcn/ui 원자 컴포넌트 (수정 금지)
│   │   ├── student/             # 학생 화면 전용 컴포넌트
│   │   ├── teacher/             # 교사 대시보드 전용 컴포넌트
│   │   └── common/              # 공통 재사용 컴포넌트
│   ├── hooks/                   # 커스텀 훅 (useMediaRecorder, useWebSpeech 등)
│   ├── lib/                     # Supabase client 등 외부 인프라 초기화
│   │   └── supabase.ts
│   ├── store/                   # Zustand 전역 스토어
│   │   ├── audioStore.ts        # 음성 처리 상태 (STT 경로, confidence, blob)
│   │   └── uiStore.ts           # UI 상태 (아바타 상태, 자막, 로딩)
│   ├── types/                   # TypeScript 공통 타입 정의
│   └── package.json
│
├── backend/                     # FastAPI Whisper Fallback 서버
│   ├── app/
│   │   ├── main.py              # 엔트리포인트 (CORS, 미들웨어)
│   │   ├── api/                 # 라우터 (v1/stt, v1/health)
│   │   ├── services/            # Whisper 추론 비즈니스 로직
│   │   ├── models/              # Pydantic 스키마
│   │   └── core/
│   │       └── config.py        # 환경변수 및 설정
│   ├── tests/
│   ├── requirements.txt
│   ├── pyproject.toml
│   ├── Dockerfile
│   └── README.md
│
├── docs/                        # 기획서 및 구조도
├── .env.example                 # 환경변수 샘플 (아래 §6 참조)
├── docker-compose.yml           # 로컬 통합 실행
├── turbo.json                   # 모노레포 빌드 파이프라인
├── .gitignore
└── CLAUDE.md                    # 이 파일
```

---

## 4. Coding Conventions

### 4.1 TypeScript (Frontend)

- **파일명**: 컴포넌트는 `PascalCase.tsx`, 훅은 `useCamelCase.ts`, 유틸은 `camelCase.ts`
- **컴포넌트명**: `PascalCase` — 예: `MicrophoneButton`, `SubtitleDisplay`
- **함수/변수명**: `camelCase` — 예: `handleMicClick`, `confidenceScore`
- **상수**: `UPPER_SNAKE_CASE` — 예: `CONFIDENCE_THRESHOLD = 0.85`
- **타입/인터페이스**: `PascalCase`, `interface` 우선 사용 (`type`은 Union/Intersection에만)
- **exports**: named export 사용. `export default`는 Next.js page 컴포넌트에만 허용

```typescript
// ✅ 올바른 예
export const CONFIDENCE_THRESHOLD = 0.85;

export interface SpeechResult {
  text: string;
  confidence: number;
  path: 'A' | 'B';
}

export function useMicrophoneControl() { ... }

// ❌ 금지
export default function useMicrophoneControl() { ... }
```

### 4.2 Python (Backend)

- **파일명**: `snake_case.py`
- **함수/변수명**: `snake_case`
- **클래스명**: `PascalCase`
- **상수**: `UPPER_SNAKE_CASE`
- **타입 힌트**: 모든 함수에 필수. `from __future__ import annotations` 사용
- **Pydantic 모델**: `app/models/` 에만 위치

```python
# ✅ 올바른 예
from __future__ import annotations
from pydantic import BaseModel

WHISPER_CONFIDENCE_THRESHOLD = 0.85

class STTRequest(BaseModel):
    language: str = "en"

async def transcribe_audio(audio_bytes: bytes, language: str = "en") -> STTResponse:
    ...
```

### 4.3 컴포넌트 작성 규칙

- **Server Component 기본**: 클라이언트 상호작용이 필요한 경우에만 `"use client"` 추가
- **Props 타입**: 항상 별도 `interface`로 정의, inline 금지
- **shadcn/ui 컴포넌트**: `components/ui/` 원본은 절대 수정 금지. 커스터마이징은 래핑 컴포넌트로

```typescript
// ✅ 올바른 예
interface MicrophoneButtonProps {
  isRecording: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function MicrophoneButton({ isRecording, onStart, onStop }: MicrophoneButtonProps) {
  ...
}
```

---

## 5. Absolute Rules (절대 금지 사항)

Claude는 아래 규칙을 **어떤 상황에서도** 위반해서는 안 됩니다.

### 5.1 TypeScript

```typescript
// ❌ 절대 금지
const data: any = ...          // any 타입 사용 금지 — unknown 또는 명시적 타입 사용
// eslint-disable-next-line    // ESLint 비활성화 주석 금지
console.log(...)               // console.log 금지 — logger 유틸 또는 toast 사용
as unknown as SomeType         // 이중 타입 단언 금지
```

### 5.2 환경변수 & 보안

```typescript
// ❌ 절대 금지
const apiKey = "sk-abc123..."           // API 키 하드코딩 금지
const url = "http://localhost:8000"     // URL 하드코딩 금지 — 환경변수 사용
```

```typescript
// ✅ 올바른 예
const apiKey = process.env.OPENAI_API_KEY!;
const whisperUrl = process.env.NEXT_PUBLIC_WHISPER_SERVER_URL!;
```

### 5.3 Audio Blob 처리

```typescript
// ❌ 절대 금지 — Path A 확정 후 Blob 미파기
if (confidence >= CONFIDENCE_THRESHOLD) {
  sendToGPT(text);
  // blob을 파기하지 않으면 메모리 누수 발생
}

// ✅ 올바른 예
if (confidence >= CONFIDENCE_THRESHOLD) {
  blobChunks.current = [];   // 즉시 파기
  sendToGPT(text);
}
```

### 5.4 Git

- `.env`, `.env.local`, `.env.production` 파일은 절대 커밋 금지
- `node_modules/`, `__pycache__/`, `.next/`, `venv/` 커밋 금지
- 커밋 메시지 형식: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:` prefix 필수

---

## 6. Environment Variables

### Frontend (`frontend/.env.local`)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJh...

# OpenAI (개발기 — 상용기 전환 후 backend로 이동)
OPENAI_API_KEY=sk-...

# ElevenLabs (상용기 전환 후 활성화)
ELEVENLABS_API_KEY=

# FastAPI Whisper 서버
NEXT_PUBLIC_WHISPER_SERVER_URL=http://localhost:8000

# 환경 구분
NEXT_PUBLIC_ENV=development
```

### Backend (`backend/.env`)

```bash
# OpenAI Whisper API (개발기)
OPENAI_API_KEY=sk-...

# Whisper 설정
WHISPER_BACKEND=openai        # openai | local (상용기: local)
WHISPER_MODEL_SIZE=large-v3   # 로컬 전환 시 사용

# 서버 설정
HOST=0.0.0.0
PORT=8000

# CORS 허용 오리진
ALLOWED_ORIGINS=http://localhost:3000,https://your-vercel-app.vercel.app
```

---

## 7. API Endpoints (FastAPI Backend)

| Method | Endpoint | 설명 |
|--------|----------|------|
| `POST` | `/api/v1/stt` | 음성 Blob → 텍스트 변환 (핵심) |
| `GET` | `/health` | 서버 상태 확인 |
| `GET` | `/api/v1/model-info` | 현재 로드된 Whisper 모델 정보 |

### POST /api/v1/stt

```
Request  (multipart/form-data)
  audio_blob: File   # WebM 또는 WAV
  language:   str    # 기본값 "en"

Response (200 OK)
  { "text": "Hello, my name is...", "confidence": 0.91, "duration_ms": 340 }

Error (422 / 500)
  { "error": "audio_too_short", "message": "최소 0.5초 이상 필요" }
```

---

## 8. Database Schema (Supabase)

Claude가 Supabase 쿼리를 작성할 때 반드시 아래 스키마를 참조하세요.

```sql
-- 사용자 (Supabase Auth와 연동)
profiles (
  id          uuid PRIMARY KEY,  -- auth.users.id와 동일
  role        text,              -- 'student' | 'teacher'
  name        text,
  created_at  timestamptz
)

-- 클래스
classes (
  id          uuid PRIMARY KEY,
  teacher_id  uuid REFERENCES profiles(id),
  name        text,
  created_at  timestamptz
)

-- 수업 세션
sessions (
  id          uuid PRIMARY KEY,
  class_id    uuid REFERENCES classes(id),
  started_at  timestamptz,
  ended_at    timestamptz
)

-- 대화 로그
conversation_logs (
  id             uuid PRIMARY KEY,
  session_id     uuid REFERENCES sessions(id),
  student_id     uuid REFERENCES profiles(id),
  role           text,           -- 'student' | 'ai'
  content        text,
  stt_path       text,           -- 'A' | 'B' (어느 STT 경로로 처리됐는지)
  confidence     float,          -- Web Speech API confidence score
  latency_ms     int,            -- 전체 처리 지연 시간
  created_at     timestamptz
)
```

> ⚠️ 스키마는 개발 진행에 따라 변경될 수 있습니다. 변경 시 이 파일도 반드시 함께 업데이트하세요.

---

## 9. Common Commands

### Frontend

```bash
cd frontend

npm run dev          # 개발 서버 실행 (localhost:3000)
npm run build        # 프로덕션 빌드
npm run lint         # ESLint 검사
npm run type-check   # TypeScript 타입 검사 (tsc --noEmit)
```

### Backend

```bash
cd backend

python -m venv venv && source venv/bin/activate   # 가상환경 생성 및 활성화
pip install -r requirements.txt                    # 의존성 설치

uvicorn app.main:app --reload --port 8000          # 개발 서버 실행
pytest tests/                                      # 테스트 실행
```

### Docker (로컬 통합 실행)

```bash
# 루트 디렉토리에서
docker-compose up --build    # 전체 스택 실행 (frontend + backend)
docker-compose down          # 종료
```

### Turborepo

```bash
# 루트 디렉토리에서
npx turbo dev                # 전체 dev 서버 병렬 실행
npx turbo build              # 전체 빌드
npx turbo lint               # 전체 lint
```

---

## 10. TBD (미결 사항)

아래 항목은 현재 미확정이며, 개발 진행 중 결정됩니다. Claude는 이 항목에 대해 임의로 구현하지 말고 반드시 사용자에게 확인 후 진행하세요.

| 항목 | 현재 상태 | 결정 시점 |
|------|-----------|-----------|
| VAD 구현 방식 | Push-to-Talk 우선, 자동 VAD는 2차 | Week 2~3 UX 테스트 후 |
| Confidence 임계값 최적값 | 0.85 (초기값) | Week 4 iPad Safari 실측 후 조정 |
| ElevenLabs 전환 시점 | OpenAI TTS로 MVP 완성 후 검토 | Week 7 비용/품질 측정 후 |
| 8명 동시 접속 Queue 전략 | FastAPI 비동기 기본 활용 예정 | Week 8 부하 테스트 후 확정 |
| Mac Mini 로컬 전환 조건 | API 비용 월 10만 원 초과 시 | Week 9~10 베타 결과 기반 |
| Voice Cloning 도입 여부 | 상용기 전환 후 검토 | 학원 측 요구사항 기반 |

---

**문서 버전**: v1.1
**최종 수정**: 2026년 5월
