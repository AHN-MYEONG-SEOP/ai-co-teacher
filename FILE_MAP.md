# AI Co-Teacher 파일 지도 (File Map)

**목적**: 기능 수정 시 어떤 파일의 어느 부분을 봐야 하는지 빠르게 찾기 위한 문서
**작성일**: 2026-06-06
**기준 버전**: v2026-06-06.18

---

## 📁 전체 폴더 구조

```
ai-co-teacher/
├── frontend/                  ← Next.js 앱 (메인)
│   ├── app/                   ← 페이지 + API
│   ├── components/            ← UI 컴포넌트
│   ├── hooks/                 ← 커스텀 훅
│   ├── store/                 ← 전역 상태
│   ├── prompts/               ← GPT 프롬프트
│   ├── types/                 ← TypeScript 타입
│   ├── lib/                   ← 유틸 함수
│   ├── data/                  ← 정적 데이터
│   └── public/                ← 이미지/영상 파일
├── backend/                   ← FastAPI (미사용 중)
├── db/                        ← SQL 파일 모음
├── CLAUDE.md                  ← 프로젝트 지침
├── CHANGELOG.md               ← 변경 이력
└── SESSION_SUMMARY.md         ← 세션 요약
```

---

## 🖥️ 화면별 파일

### 1. 학생 자습 화면 (`/student`)
```
frontend/app/(student)/page.tsx       ← 메인 화면 (2000줄+, 핵심 파일)
```
| 위치 (줄 번호 기준) | 내용 |
|---|---|
| 1~20 | import 목록 |
| 21~230 | SettingsModal (설정 모달) |
| 231~270 | PlaybackButton (재생 버튼) |
| 285~325 | ToggleSwitch (토글) |
| 328~415 | AudioProcessingModal (오디오 설정) |
| 446~530 | ProgressModal (진행 상황) |
| 534~660 | ScenarioInspectorModal (시나리오 확인) |
| 670~690 | StatusBar (상태 표시줄) |
| 685~726 | WordConfidenceDisplay (단어 신뢰도) |
| 727~790 | FeedbackCard 관련 |
| 875~1040 | ConfirmStartCard / BookUnitPickerCard |
| 1040~1200 | 메인 컴포넌트 상태 선언부 |
| 1200~1300 | useEffect 모음 |
| 1300~1500 | 핸들러 함수 (handleFinalResult, handleFallback 등) |
| 1500~1520 | cotyState 매핑 + return 시작 |
| 1520~1700 | 대화창 렌더링 (말풍선, 피드백) |
| 1700~1820 | 상황 안내, 실시간 자막 |
| 1820~1900 | 마이크 버튼 영역 |
| 1900~2020 | 모달들 + DevLogPanel |

### 2. 교사 대시보드 (`/teacher`)
```
frontend/app/(teacher)/teacher/page.tsx   ← 교사 메인 화면
```

### 3. 로그인 (`/login`)
```
frontend/app/login/page.tsx               ← 로그인 화면
```

---

## 🧩 컴포넌트별 파일

### Coty 아바타
```
frontend/components/student/CotyAvatar.tsx
```
| 수정 상황 | 위치 |
|---|---|
| 아바타 크기 변경 | `w-[240px] lg:w-[420px]` className |
| 영상 파일 변경 | `videoMap` 객체 |
| 상태 추가 | `CotyState` 타입 + `videoMap` + `labelMap` |
| 태블릿/모바일 기준 변경 | `hidden md:flex` |
| 1회 재생 상태 추가/제거 | `oneShot` Set |

### Dev Log 패널
```
frontend/components/DevLogPanel.tsx
```
| 수정 상황 | 위치 |
|---|---|
| 탭 필터 추가 | `TabFilter` 타입 + `matchesTab` 함수 |
| 로그 색상 변경 | 각 type별 className |
| 통계 항목 추가 | 하단 통계 바 렌더링 부분 |

### 공통 NavBar
```
frontend/components/common/NavBar.tsx
```
| 수정 상황 | 위치 |
|---|---|
| 버튼 추가/제거 | return 문 내부 |
| 버전 표시 위치 | APP_VERSION 렌더링 부분 |

### 피드백 카드
```
frontend/components/student/FeedbackCard.tsx
```
| 수정 상황 | 위치 |
|---|---|
| 점수 항목 추가/제거 | 렌더링 부분 |
| 발음 교정 표시 | pronunciation 섹션 |

---

## 🪝 훅(Hook)별 파일

### STT (음성 인식)
```
frontend/hooks/useWebSpeech.ts         ← Deepgram STT 메인
frontend/hooks/useMediaRecorder.ts     ← 녹음 관리
```
| 수정 상황 | 파일 | 위치 |
|---|---|---|
| STT 모델 변경 (nova-2→nova-3) | useWebSpeech.ts | `model` 파라미터 |
| keyword boosting 수정 | useWebSpeech.ts | `keywords` 파라미터 |
| 침묵 감지 시간 변경 | useWebSpeech.ts | VAD 섹션 |
| 노이즈 필터 수정 | useWebSpeech.ts | Web Audio 파이프라인 |
| Blob 처리 수정 | useMediaRecorder.ts | `onstop` 핸들러 |

### 대화 관리
```
frontend/hooks/useConversation.ts      ← 대화 상태 + GPT 호출
```
| 수정 상황 | 위치 |
|---|---|
| 메시지 추가 방식 변경 | `addMessage` 함수 |
| TTS 재생 로직 변경 | `sendToGPT` 내부 |
| 진행률 계산 변경 | `progress` 계산 부분 |
| 세션 종료 조건 변경 | `sessionEnded` 감지 |

### 학생 세션
```
frontend/hooks/useStudentSession.ts    ← 프로필/세션 로드
```
| 수정 상황 | 위치 |
|---|---|
| 프로필 조회 변경 | Supabase 쿼리 부분 |
| ready 조건 변경 | `ready` 플래그 설정 |

### 교재 데이터
```
frontend/hooks/useCurriculum.ts        ← curriculum.json 파싱
```
| 수정 상황 | 위치 |
|---|---|
| 교재 레벨 추가 | `level_order` 배열 |
| 단어 추출 방식 변경 | `getUnitData` 함수 |

---

## 🔌 API별 파일

### 메인 대화 (GPT)
```
frontend/app/api/chat/route.ts         ← 핵심 API (GPT 호출 + 피드백)
```
| 수정 상황 | 위치 |
|---|---|
| GPT 모델 변경 | `model` 파라미터 |
| 응답 형식 변경 | `response_format` + 파싱 부분 |
| 피드백 필드 추가 | GPT 응답 파싱 부분 |
| Step 완료 판정 변경 | `step_completed` 처리 |
| TTS 호출 변경 | ElevenLabs fetch 부분 |

### TTS (음성 생성)
```
frontend/app/api/tts/route.ts          ← ElevenLabs TTS
```
| 수정 상황 | 위치 |
|---|---|
| 목소리 변경 | `voice_id` 파라미터 |
| 속도 조절 | `stability`, `similarity_boost` |
| OpenAI 폴백 수정 | 폴백 섹션 |

### 시나리오
```
frontend/app/api/lesson-scenario/route.ts   ← 시나리오 로드/저장
```
| 수정 상황 | 위치 |
|---|---|
| 시나리오 조회 조건 변경 | GET 핸들러 쿼리 |
| 회차 생성 방식 변경 | POST `action:'start'` 핸들러 |
| 진도 업데이트 변경 | UPDATE 쿼리 |

### 페르소나
```
frontend/app/api/persona/route.ts      ← 학생 페르소나 관리
```

### 교사 관련 API
```
frontend/app/api/teacher/
  classes/route.ts          ← 반 CRUD
  teachers/route.ts         ← 교사 CRUD
  create-student/route.ts   ← 학생 계정 생성
  assign-student/route.ts   ← 학생 반 배정
  scenarios/route.ts        ← 시나리오 편집
```

---

## 💾 전역 상태 (Store)

### UI 상태
```
frontend/store/uiStore.ts
```
| 상태 | 용도 |
|---|---|
| `messages` | 대화 메시지 목록 |
| `isLogDrawerOpen` | 로그 드로어 열림/닫힘 |
| `avatarStatus` | Coty 아바타 상태 |
| `interimText` | 실시간 자막 텍스트 |

### 오디오 상태
```
frontend/store/audioStore.ts
frontend/store/audioConfigStore.ts    ← 노이즈 필터 설정
```

---

## 🧠 GPT 프롬프트

### 시스템 프롬프트
```
frontend/prompts/system-prompt.ts     ← Coty 지침 빌더 (핵심)
```
| 수정 상황 | 위치 |
|---|---|
| Coty 성격/규칙 변경 | `buildSystemPrompt` 함수 내부 |
| 정답 판정 기준 변경 | 판정 규칙 섹션 |
| 힌트 제공 방식 변경 | 힌트 규칙 섹션 |
| 발음 피드백 강화 | pronunciation 섹션 |
| alreadyCompleted 동작 변경 | closing 섹션 |

---

## 📐 타입 정의

```
frontend/types/index.ts               ← 모든 TypeScript 타입
```
| 타입 | 용도 |
|---|---|
| `ConversationMessage` | 대화 메시지 구조 |
| `MessageFeedback` | 피드백 구조 (grammar, pronunciation 등) |
| `LessonScenario` | 시나리오 구조 |
| `StepProgress` | Step 진행 상태 |
| `StudentSettings` | 학생 설정 |

---

## 🗄️ 데이터베이스

### SQL 파일 위치
```
db/
  2026-06-02_lesson_progress_attempt.sql
  2026-06-02_drop_old_unique_session.sql
  ...
```

### 주요 테이블 → 관련 파일
| 테이블 | 주로 사용하는 파일 |
|---|---|
| `profiles` | useStudentSession.ts, teacher/create-student |
| `classes` | teacher/classes/route.ts |
| `lesson_scenarios` | lesson-scenario/route.ts, teacher/scenarios |
| `lesson_progress` | lesson-scenario/route.ts, chat/route.ts |
| `conversation_logs` | log/route.ts |
| `student_personas` | persona/route.ts |

---

## 🎬 미디어 파일

### Coty 아바타 영상
```
frontend/public/avatars/
  coty/
    coty-idle.mp4        ← 대기
    coty-speaking.mp4    ← 말하는 중
    coty-correct.mp4     ← 정답 (1회 재생)
    coty-encourage.mp4   ← 격려 (1회 재생)
    coty-think.mp4       ← 생각/힌트
```

### Coty 표정 이미지 (미사용, 보관)
```
frontend/public/
  coty-idle.jpg
  coty-praise.jpg
  coty-think.jpg
  coty-correct.jpg
  coty-encourage.jpg
```

---

## ⚙️ 설정 파일

### 버전 관리
```
frontend/lib/version.ts               ← APP_VERSION (배포마다 수정)
```

### 환경변수
```
frontend/.env.local                   ← API 키 (Git에 올리면 안 됨)
```
| 변수 | 용도 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 주소 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 공개 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase 관리자 키 |
| `DEEPGRAM_API_KEY` | STT |
| `OPENAI_API_KEY` | GPT |
| `ELEVENLABS_API_KEY` | TTS |
| `NEXT_PUBLIC_DEV_LOG` | Dev Log 패널 ON/OFF |

---

## 🔧 기능별 수정 가이드

### "Coty가 말하는 방식을 바꾸고 싶다"
```
1. frontend/prompts/system-prompt.ts
   → buildSystemPrompt 함수 수정
2. frontend/app/api/chat/route.ts
   → GPT 응답 파싱 부분 확인
```

### "마이크 동작을 바꾸고 싶다"
```
1. frontend/hooks/useWebSpeech.ts
   → STT 관련 로직
2. frontend/hooks/useMediaRecorder.ts
   → 녹음 관련 로직
3. frontend/app/(student)/page.tsx
   → handleMicStart / handleMicStop 함수 (1466~1497줄)
```

### "피드백 UI를 바꾸고 싶다"
```
1. frontend/components/student/FeedbackCard.tsx
   → UI 변경
2. frontend/types/index.ts
   → MessageFeedback 타입 변경
3. frontend/app/api/chat/route.ts
   → GPT 응답에서 피드백 파싱 변경
4. frontend/prompts/system-prompt.ts
   → GPT에게 피드백 형식 지시 변경
```

### "새 학생 설정 항목을 추가하고 싶다"
```
1. frontend/types/index.ts
   → StudentSettings 인터페이스에 추가
2. frontend/app/(student)/page.tsx
   → SettingsModal 컴포넌트에 UI 추가 (21~230줄)
3. frontend/hooks/useStudentSession.ts
   → 설정 로드/저장 로직 추가
4. Supabase profiles 테이블
   → 컬럼 추가
```

### "새 API 엔드포인트를 추가하고 싶다"
```
1. frontend/app/api/[새이름]/route.ts 생성
2. frontend/types/index.ts
   → 관련 타입 추가
3. 호출하는 훅이나 컴포넌트에서 fetch 추가
```

### "Coty 아바타 상태를 추가하고 싶다"
```
1. frontend/components/student/CotyAvatar.tsx
   → CotyState 타입에 추가
   → videoMap에 영상 경로 추가
   → labelMap에 라벨 추가
2. frontend/app/(student)/page.tsx
   → cotyState 매핑 로직 수정 (1500줄 부근)
3. frontend/public/avatars/coty/
   → 새 mp4 파일 추가
```

### "DB 테이블을 추가하고 싶다"
```
1. Supabase SQL Editor에서 CREATE TABLE 실행
2. frontend/types/index.ts
   → 새 테이블 타입 추가
3. 관련 API route.ts 생성 또는 수정
4. db/ 폴더에 SQL 파일 보관
```

---

## 📋 자주 쓰는 grep 명령어

```bash
# 특정 기능 위치 찾기
grep -n "함수명\|변수명" frontend/app/\(student\)/page.tsx

# 특정 컴포넌트 어디서 쓰는지 찾기
grep -rn "CotyAvatar" frontend/

# 특정 API 어디서 호출하는지 찾기
grep -rn "/api/chat" frontend/

# 특정 타입 어디서 쓰는지 찾기
grep -rn "CotyState" frontend/
```
