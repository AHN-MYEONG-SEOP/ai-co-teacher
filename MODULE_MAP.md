# AI Co-Teacher 모듈 맵 (MODULE_MAP.md)

**목적**: 기능별 파일/함수 위치를 한눈에 파악하고,
수정 시 정확한 위치로 바로 찾아가기 위한 문서

**관리 규칙**:
- 새 함수/컴포넌트 추가 시 즉시 업데이트
- 함수 이름/위치 변경 시 즉시 업데이트
- 기능 설명도 함께 업데이트

**마지막 업데이트**: 2026-06-07 (v2026-06-06.34)

---

## 1. 학생 자습 화면
**파일**: `frontend/app/(student)/page.tsx`

| 기능 | 함수명 | 줄 번호 |
|------|--------|---------|
| 메인 컴포넌트 | `StudentPage()` | 1033 |
| 마이크 시작 | `handleMicStart()` | 1499 |
| 마이크 종료 | `handleMicStop()` | 1524 |
| STT 중간 결과 | `handleInterim()` | 1348 |
| STT 최종 결과 | `handleFinalResult()` | 1353 |
| STT 폴백 처리 | `handleFallback()` | 1377 |
| STT 오류 처리 | `handleError()` | 1453 |
| 오디오 Blob 준비 | `handleBlobReady()` | 1309 |
| 오디오 Blob 저장 | `handleBlobSaved()` | 1332 |
| 스트림 준비 | `handleStreamReady()` | 1460 |
| 수업 종료/로그아웃 | `handleExit()` | 1166 |
| Unit 선택 완료 | `handlePickUnit()` | 1214 |
| 설정 모달 저장 | `handleSave()` | 36 |
| 힌트 표시 | `handleShowHint()` | 721 |

---

## 2. 훅 (Hooks)
**폴더**: `frontend/hooks/`

### useWebSpeech.ts
**기능**: Deepgram STT + 마이크 스트림 관리

| 기능 | 함수/속성 | 설명 |
|------|---------|------|
| 훅 진입점 | `useWebSpeech()` | 24줄 |
| STT 시작 | `startListening()` | 마이크 열고 Deepgram 연결 |
| STT 종료 | `stopListening()` | 마이크 닫고 결과 반환 |
| 침묵 감지 | VAD 섹션 | 내부 로직 |
| keyword boosting | `keywords` 파라미터 | Deepgram 정확도 향상 |

### useConversation.ts
**기능**: GPT 대화 관리 + TTS 재생

| 기능 | 함수/속성 | 설명 |
|------|---------|------|
| 훅 진입점 | `useConversation()` | 98줄 |
| GPT 전송 | `sendToGPT()` | 학생 발화 → GPT → TTS |
| 진행률 | `progress` | 현재 step 진행률 |
| 세션 종료 | `sessionEnded` | 수업 완료 여부 |
| 현재 장면 | `currentScene` | step 상황 설명 |

### useStudentSession.ts
**기능**: 학생 프로필/세션 로드

| 기능 | 함수/속성 | 설명 |
|------|---------|------|
| 훅 진입점 | `useStudentSession()` | 37줄 |
| 학생 ID | `studentId` | Supabase Auth user.id |
| 반 ID | `classId` | 소속 반 |
| 설정 | `settings` | tts_speed, show_feedback 등 |
| 설정 업데이트 | `updateSettings()` | DB + 로컬 상태 동기화 |

### useMediaRecorder.ts
**기능**: 오디오 녹음 + Blob 관리

| 기능 | 함수/속성 | 설명 |
|------|---------|------|
| 훅 진입점 | `useMediaRecorder()` | 9줄 |
| 녹음 시작 | `startRecording()` | MediaRecorder 시작 |
| Blob 버리기 | `discardBlob()` | 녹음 취소 |
| 마지막 URL | `lastBlobUrl` | 원본 오디오 URL |

### useCurriculum.ts
**기능**: 교재 데이터 로드/파싱

| 기능 | 함수/속성 | 설명 |
|------|---------|------|
| 훅 진입점 | `useCurriculum()` | 20줄 |
| 레벨별 교재 | `booksByLevel` | 레벨 → 교재 목록 |
| 레벨 순서 | `level_order` | 교재 레벨 정렬 순서 |
| Unit 목록 | `getUnits(book)` | 교재별 Unit 목록 |

---

## 3. API 엔드포인트
**폴더**: `frontend/app/api/`

### /api/chat (핵심)
**파일**: `app/api/chat/route.ts` (76줄)
**기능**: GPT 호출 + 학생 발화 채점 + TTS 생성

| HTTP | 기능 | 설명 |
|------|------|------|
| POST | 대화 처리 | 학생 발화 → GPT → 피드백 + TTS |

**입력**:
```
message: 학생 발화 텍스트
sessionId: 대화 세션 ID
scenario: 시나리오 데이터
stepProgress: 현재 step 진행 상태
```

**출력**:
```
content: Coty 응답 텍스트
audioBase64: TTS 음성 (base64)
feedback: { grammar, overall, pronunciation, retry_reason }
step_completed: 정답 여부
hint_used: 힌트 사용 여부
```

### /api/tts
**파일**: `app/api/tts/route.ts` (54줄)
**기능**: ElevenLabs TTS 음성 생성

| HTTP | 기능 |
|------|------|
| POST | 텍스트 → 음성 Blob |

### /api/lesson-scenario
**파일**: `app/api/lesson-scenario/route.ts`
**기능**: 시나리오 로드/저장/진도 관리

| HTTP | 줄 | 기능 |
|------|-----|------|
| GET | 61 | 시나리오 조회 |
| POST | 123 | 시나리오 저장 / 회차 시작 / 진도 업데이트 |

### /api/persona
**파일**: `app/api/persona/route.ts`
**기능**: 학생 페르소나 관리

| HTTP | 줄 | 기능 |
|------|-----|------|
| GET | 50 | 페르소나 조회 |
| POST | 73 | 페르소나 업데이트 |

### /api/lesson-report
**파일**: `app/api/lesson-report/route.ts`
**기능**: 학습 리포트 생성/조회

| HTTP | 줄 | 기능 |
|------|-----|------|
| POST | 13 | 리포트 생성 |
| GET | 144 | 리포트 조회 |

### /api/deepgram-token
**파일**: `app/api/deepgram-token/route.ts` (5줄)
**기능**: Deepgram 임시 토큰 발급

| HTTP | 기능 |
|------|------|
| GET | Deepgram WebSocket 토큰 발급 |

### /api/phoneme
**파일**: `app/api/phoneme/route.ts` (3줄)
**기능**: HuggingFace wav2vec2 IPA 음소 분석

| HTTP | 기능 |
|------|------|
| POST | 오디오 → IPA 음소 시퀀스 |

> ⚠️ **현재 보류**: Codespaces/Vercel 네트워크 제한으로 비활성
> Mac Mini M4 구축 후 로컬 서버로 재시도 예정

### /api/classroom/end-session
**파일**: `app/api/classroom/end-session/route.ts` (4줄)
**기능**: 교실 세션 종료 (브라우저 닫을 때 sendBeacon 용)

| HTTP | 기능 |
|------|------|
| POST | classroom_sessions.status → 'ended' |

### /api/log
**파일**: `app/api/log/route.ts` (6줄)
**기능**: 클라이언트 로그 저장

| HTTP | 기능 |
|------|------|
| POST | 로그 DB 저장 |

### /api/study-log
**파일**: `app/api/study-log/route.ts`
**기능**: 학습 로그 저장/조회

| HTTP | 줄 | 기능 |
|------|-----|------|
| POST | 6 | 학습 로그 저장 |
| GET | 54 | 학습 로그 조회 |

### /api/teacher/*
**폴더**: `app/api/teacher/`

| 파일 | HTTP | 줄 | 기능 |
|------|------|-----|------|
| scenarios/route.ts | GET | 44 | 시나리오 목록 조회 |
| scenarios/route.ts | POST | 74 | 시나리오 생성/수정 |
| scenarios/route.ts | DELETE | 128 | 시나리오 삭제 |
| classes/route.ts | GET | 23 | 반 목록 조회 |
| classes/route.ts | POST | 67 | 반 생성 |
| classes/route.ts | DELETE | 105 | 반 삭제 |
| teachers/route.ts | GET | 14 | 교사 목록 조회 |
| teachers/route.ts | POST | 44 | 교사 생성 |
| teachers/route.ts | DELETE | 78 | 교사 삭제 |
| create-student/route.ts | POST | 6 | 학생 계정 생성 |
| assign-student/route.ts | POST | 7 | 학생 반 배정 |

---

## 4. 컴포넌트
**폴더**: `frontend/components/`

### CotyAvatar.tsx
**파일**: `components/student/CotyAvatar.tsx`
**기능**: Coty 선생님 아바타 영상 표시

| 함수/타입 | 설명 |
|---------|------|
| `CotyAvatar({ state })` | 메인 컴포넌트 |
| `CotyState` | 'idle' \| 'speaking' \| 'listening' \| 'processing' \| 'correct' \| 'encourage' \| 'think' |
| `videoMap` | 상태별 MP4 파일 경로 |
| `oneShot` | 1회 재생 후 idle 복귀 상태 Set |

### LessonCell.tsx
**파일**: `components/student/LessonCell.tsx`
**기능**: 학생 1명의 수업 칸 (선생님/학생 화면 공용)

| 함수/타입 | 설명 |
|---------|------|
| `LessonCell(props)` | 메인 컴포넌트 |
| `LessonCellProps` | props 타입 정의 |

### ClassroomStartModal.tsx
**파일**: `components/teacher/ClassroomStartModal.tsx`
**기능**: 교실 수업 시작 모달 (교재/Unit/그리드 선택)

| 함수/타입 | 설명 |
|---------|------|
| `ClassroomStartModal(props)` | 메인 컴포넌트 |
| `handleStart()` | 세션 생성 + 수업 시작 |

### DevLogPanel.tsx
**파일**: `components/DevLogPanel.tsx`
**기능**: 개발용 실시간 로그 패널 (데스크탑 전용)

| 함수/타입 | 설명 |
|---------|------|
| `DevLogPanel({ logs, onClear })` | 메인 컴포넌트 |
| `matchesTab()` | 탭 필터 로직 (STT/GPT/TTS/오류) |

### NavBar.tsx
**파일**: `components/common/NavBar.tsx`
**기능**: 상단 네비게이션 바 (버전 표시, 로그, 설정)

### ScenarioEditor.tsx
**파일**: `components/teacher/ScenarioEditor.tsx`
**기능**: 시나리오 편집기 (교사 대시보드 내)

---

## 5. 스토어 (전역 상태)
**폴더**: `frontend/store/`

| 파일 | 주요 상태 | 설명 |
|------|---------|------|
| `uiStore.ts` | messages, avatarStatus, isLogDrawerOpen, interimText | UI 전역 상태 |
| `audioStore.ts` | 오디오 관련 상태 | 녹음/재생 상태 |
| `audioConfigStore.ts` | 노이즈 필터 설정 | Web Audio 파이프라인 설정 |

---

## 6. GPT 프롬프트
**폴더**: `frontend/prompts/`

| 파일 | 함수 | 설명 |
|------|------|------|
| `system-prompt.ts` | `buildSystemPrompt()` | Coty 시스템 프롬프트 빌더 |

**buildSystemPrompt() 입력**:
```
scenario: 시나리오 데이터
studentName: 학생 이름
stepProgress: step 진행 상태
persona: 학생 페르소나
```

---

## 7. 타입 정의
**파일**: `frontend/types/index.ts`

| 타입 | 설명 |
|------|------|
| `ConversationMessage` | 대화 메시지 구조 |
| `MessageFeedback` | 피드백 구조 (grammar, overall 등) |
| `LessonScenario` | 시나리오 전체 구조 |
| `StepProgress` | step 진행 상태 |
| `StudentSettings` | 학생 설정 (tts_speed 등) |
| `WordResult` | 단어별 STT 신뢰도 |

---

## 8. 화면별 파일

| URL | 파일 | 설명 |
|-----|------|------|
| `/` (student) | `app/(student)/page.tsx` | 학생 자습/수업 화면 |
| `/teacher` | `app/(teacher)/teacher/page.tsx` | 교사 대시보드 |
| `/teacher/classroom` | `app/(teacher)/teacher/classroom/page.tsx` | 교사 교실 화면 |
| `/student/classroom` | `app/student/classroom/page.tsx` | 학생 교실 화면 |
| `/login` | `app/login/page.tsx` | 로그인 화면 |

---

## 9. 미디어 파일
**폴더**: `frontend/public/`

### Coty 아바타 영상
```
public/avatars/coty/
  coty-idle.mp4        ← 대기 (루프)
  coty-speaking.mp4    ← 말하는 중 (루프)
  coty-correct.mp4     ← 정답 (1회 재생)
  coty-encourage.mp4   ← 격려 (1회 재생)
  coty-think.mp4       ← 생각/힌트 (루프)
```

### Coty 표정 이미지 (보관용)
```
public/
  coty-idle.jpg
  coty-praise.jpg
  coty-think.jpg
  coty-correct.jpg
  coty-encourage.jpg
```

---

## 10. 기능별 수정 가이드

### 마이크 동작 변경
```
1. handleMicStart() → app/(student)/page.tsx (1499줄)
2. handleMicStop()  → app/(student)/page.tsx (1524줄)
3. useWebSpeech.ts  → startListening() / stopListening()
4. useMediaRecorder.ts → startRecording()
```

### GPT 응답/채점 변경
```
1. app/api/chat/route.ts (76줄) → POST handler
2. prompts/system-prompt.ts    → buildSystemPrompt()
3. useConversation.ts (98줄)   → sendToGPT()
```

### TTS 변경
```
1. app/api/tts/route.ts (54줄) → POST handler
2. useConversation.ts          → TTS 재생 로직
```

### Coty 아바타 상태 추가
```
1. components/student/CotyAvatar.tsx
   → CotyState 타입에 추가
   → videoMap에 영상 경로 추가
   → oneShot Set에 추가 (1회 재생 시)
2. app/(student)/page.tsx (1500줄 근처)
   → cotyState 매핑 로직 수정
3. public/avatars/coty/ → mp4 파일 추가
```

### 시나리오 관련 변경
```
1. app/api/lesson-scenario/route.ts
   → GET (61줄): 조회 로직
   → POST (123줄): 저장/시작/진도 로직
2. app/api/teacher/scenarios/route.ts
   → 교사용 시나리오 CRUD
```

### 학생 피드백 변경
```
1. app/api/chat/route.ts    → feedback 파싱 부분
2. types/index.ts           → MessageFeedback 타입
3. prompts/system-prompt.ts → 피드백 형식 지시
```

### 교실 수업 세션 관련
```
1. components/teacher/ClassroomStartModal.tsx   → handleStart()
2. app/(teacher)/teacher/classroom/page.tsx     → 선생님 교실 화면
3. app/student/classroom/page.tsx               → 학생 교실 화면 (v8 전면 재작성)
   - applyMicPolicy()     : mic_target 정책 적용 (none/all/student_id)
   - startTimer()         : 스텝/전체 타이머
   - playWelcome()        : 입장 환영 인사 TTS
   - handleReaskRequest() : 재발화 요청 기록
   - handleFinalResult()  : STT 채점 + classroom_answers 저장
4. app/api/classroom/end-session/route.ts       → 세션 종료 API
```

### 새 학생 설정 항목 추가
```
1. types/index.ts              → StudentSettings 인터페이스
2. app/(student)/page.tsx      → SettingsModal (21~230줄)
3. hooks/useStudentSession.ts  → 로드/저장 로직
4. Supabase profiles 테이블    → 컬럼 추가
```

---

## 11. 업데이트 이력

| 날짜 | 버전 | 변경 내용 |
|------|------|---------|
| 2026-06-07 | v2026-06-06.34 | 최초 작성 |
| 2026-06-08 | v2026-06-08.3  | 학생 교실 화면 v8 전면 재작성, 마이크 정책/타이머/환영인사/재발화 추가 |
