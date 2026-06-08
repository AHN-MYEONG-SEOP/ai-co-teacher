# AI Co-Teacher — SESSION SUMMARY
## 새 채팅방에서 이 파일을 업로드하면 이전 대화 내용을 이어갈 수 있습니다.

---

## 작업 방식
→ WORKING_GUIDE.md 참고

---

## 읽어야 할 파일 순서

1. 이 파일 (SESSION_SUMMARY.md)
2. https://github.com/AHN-MYEONG-SEOP/ai-co-teacher 공유
3. "CLAUDE.md와 CHANGELOG.md 읽고 이어서 작업해줘" 라고 하면 됨

---

## 프로젝트 기본 정보

- GitHub: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher (public)
- 배포: https://ai-co-teacher-frontend.vercel.app
- 기술스택: Next.js 15, TypeScript, Tailwind, Supabase, Deepgram nova-2, GPT-4o-mini, ElevenLabs
- AI 선생님: Coty (코티) - CLAUDE.md 기준
- 대상: 오프라인 영어 학원 최대 8명
- 현재 버전: v2026-06-06.34

---

## 오늘 세션(2026-06-06) 완료한 작업

### Dev Log 패널 (v2026-06-06.1~2)
- DevLogPanel.tsx 생성 (탭 필터, 통계 바, 자동 스크롤)
- 데스크탑 오른쪽 패널, NEXT_PUBLIC_DEV_LOG=false로 숨김
- LogEntry에 file, fn 필드 추가 → 파일명/함수명 표시

### 학생 발음 듣기 버튼 정상화 (v2026-06-06.3~5)
- saveProcessedBlob 복구, Blob URL revoke 제거
- 첫 발화부터 버튼 표시, 재생 정상화

### TTS 속도 매우 느림 추가 (v2026-06-06.6)
- very_slow(0.6x) 옵션 추가

### 이해했어요 버튼 + VAD 자동 전송 (v2026-06-06.7~10)
- AI 말 끝나면 이해했어요/종료 버튼 표시
- VAD: 침묵 감지 카운트다운 3→2→1→자동 전송
- 침묵 임계값 설정 슬라이더 (기본 40, 범위 5~80)
- profiles.silence_threshold 컬럼 추가

### feedback 시스템 개선
- /api/feedback 완전 제거 (chat 응답에 통합)
- GPT 응답에 feedback 필드 포함 (grammar, overall, retry_reason, pronunciation)
- 발음 교정 피드백 추가: student_said → target, tip_kr
- 발음 교정 지침 강화: 정확한 혀/입술/성대 위치 설명
- FeedbackCard UI: grammar + overall + retry_reason + pronunciation 표시

### 학생 발음 듣기 기능
- 학생 말풍선에 "내 발음 듣기" 버튼 추가
- Blob URL을 onFinalResult 콜백으로 직접 전달
- pendingBlobUrlRef로 타이밍 문제 해결
- 브라우저 메모리에 저장 (페이지 새로고침 전까지 유지)

### UI 개선
- 영문 보기 시 한국어 보기/숨기기 버튼 통합 (EnglishBox 안으로)
- 오답 시 AI 말풍선 비는 문제 수정 (needsAction 제거)
- 로그아웃 시 대화 히스토리 초기화 (handleExit에 reset() 추가)

### system-prompt.ts 개선
- 전면 재작성: 규칙 단순화, 현재 step 데이터 직접 주입
- alreadyCompleted 파라미터 추가: 모든 step 완료 시 closing 강제
- 마지막 step 완료 후 자연스러운 마무리 인사 처리
- 판정 기준 명확화: [정답/오답/힌트] 세 가지로 단순화

---

## 현재 system-prompt.ts 구조

buildSystemPrompt(scenario, persona, nickname, currentStep, alreadyCompleted)

- alreadyCompleted = true이면: 바로 closing 마무리 인사
- 현재 step의 curAiLine, nextAiLine을 프롬프트에 직접 삽입
- [정답] → curReaction + nextAiLine
- [오답] → 이유 설명 + curAiLine으로 끝맺음
- [힌트] → curHintLine + curAiLine

---

## DB 현황

- lesson_scenarios: Unit 1~3 데이터 포함 (INSERT 완료)
- lesson_progress: 학생별 수업 진행 기록
- lesson_sessions: 기존 테이블 (건드리지 말 것)
- conversation_logs: retry_reason 컬럼, tip 컬럼 제거됨
- profiles: stt_engine, silence_threshold 컬럼 추가됨

---

## 남아있는 알려진 문제

- book→box 처럼 비슷한 발음 단어를 발음 문제로 인식 못하는 경우 있음
  → system-prompt.ts pronunciation 판정 기준 강화 필요
- AI가 가끔 시나리오 ai_line을 무시하고 임의 질문하는 경우 있음
  → system-prompt.ts 추가 튜닝 필요

---

## Claude Code 상황

- 상태: API usage limit 도달로 사용 불가
- 초기화: 2026-07-01 00:00 UTC
- 재시작 시: Sonnet 모델로 변경 필수
- settings.json: { "model": "claude-sonnet-4-5-20251001" }

---

## 다음 할 일 (우선순위)

1순위: 테스트 및 버그 수정
   - book→box 발음 피드백 개선
   - AI가 시나리오를 더 잘 따르도록 system-prompt 튜닝
   - 내 발음 듣기 버튼 정상 동작 확인

2순위: CHANGELOG.md + SESSION_SUMMARY.md 업데이트
   - 오늘 작업 내용 반영

3순위: usage_logs 테이블 + 비용 대시보드
   - Deepgram/GPT/ElevenLabs 사용량 추적
   - 학생별/세션별 비용 집계

4순위: 에이전트 시스템 (논의 중)
   - Student Agent, Analysis Agent

5순위: Insight Builder 2 이상 시나리오 작성

---

## 주요 파일 경로

- frontend/prompts/system-prompt.ts   - GPT 지침 빌더
- frontend/app/api/chat/route.ts      - 메인 대화 + feedback 통합
- frontend/hooks/useConversation.ts   - 대화 상태 관리
- frontend/hooks/useWebSpeech.ts      - STT + Blob URL 전달
- frontend/app/(student)/page.tsx     - 학생 화면
- frontend/components/student/FeedbackCard.tsx - 피드백 UI
- frontend/lib/version.ts             - 버전 관리

---
## 오늘 세션(2026-06-07) 완료한 작업
### 현재 버전: v2026-06-06.29

### Coty 아바타 (v2026-06-06.11~14)
- CotyAvatar.tsx 생성 - 상태별 MP4 영상 자동 전환
- 영상 5개 추가: coty-idle/speaking/correct/encourage/think.mp4
- 데스크탑(lg:) + 태블릿 세로(md:) 에서 표시
- 너비 420px, 1회 재생 상태(correct/encourage) → idle 복귀

### UI 정리 (v2026-06-06.16~18)
- Dev Log 패널 토글 버튼 추가 (열기/닫기)
- 원본/가공본/이해버튼 비활성화 (코드 보존)
- 종료버튼 마이크 왼쪽으로 이동
- 침묵 카운트다운 UI 비활성화
- 태블릿 세로(768px)부터 Coty 영상 표시

### 문서 (v2026-06-06.19)
- FILE_MAP.md 생성 - 파일 지도 문서
- CLAUDE.md에 FILE_MAP.md 자동 업데이트 규칙 추가

### LessonCell 컴포넌트 (v2026-06-06.19)
- frontend/components/student/LessonCell.tsx 생성
- 학생 1명 칸 컴포넌트 (이미지+질문+답변+마이크)
- 그리드 크기에 따라 UI 자동 조정

### 교사 대시보드 교실 수업 탭 (v2026-06-06.20~22)
- 교사 대시보드에 🏫 교실 수업 탭 추가
- ClassroomStartModal.tsx 생성 - 교재/Unit/그리드 선택
- 수업 시작 시 classroom_sessions 생성

### 교실 화면 구현 (v2026-06-06.23~29)
- /teacher/classroom 선생님 교실 화면 생성
  - 학생 그리드 실시간 표시
  - 접속 학생 🟢 표시 (classroom_participants)
  - 다음 스텝 / 힌트 / 수업 종료 / 로그아웃 버튼
  - 브라우저 닫을 때 세션 자동 종료 (sendBeacon)
- /student/classroom 학생 교실 화면 생성
  - Coty 질문 텍스트 표시 (음성 없음)
  - 마이크로 답변 → classroom_answers 저장
  - Realtime으로 Step 동기화
- 학생 화면 교실 수업 초대 팝업 추가
  - 로그인 시 active 세션 자동 감지
  - Realtime으로 수업 시작 즉시 팝업
  - [나중에] / [수업 참여 →] 선택

### DB 추가 (Supabase)
- classroom_sessions - 교실 세션 관리
- classroom_questions - 질문 관리 (전체/개별)
- classroom_answers - 학생 답변 저장
- classroom_participants - 학생 접속 현황
- classes 테이블에 grid_cols, grid_rows, max_students 컬럼 추가

### 남은 문제
- 학생 교실 화면에서 GPT 채점 연동 미완성
- Coty가 교실에서 질문 생성 기능 미구현
- 선생님 화면 학생 목록 조회 방식 개선 필요

### 다음 우선순위
1. 선생님 교실 화면에서 Coty 질문 생성 + TTS 재생
2. 학생 답변 GPT 채점 연동
3. 통합 수업 화면 (/lesson) - LessonGrid 구현

---
## 오늘 세션 추가 작업 (2026-06-07 후반)
### 현재 버전: v2026-06-06.34

### 기획서 완성
- classroom-v7-spec.md 생성 (교실 수업 통합 기획서 최종)
  - 수업 엔진 통일 (스텝/프리토킹 → 시나리오 기반 통일)
  - 자습/수업 화면 통합 확정
  - 마이크 활성화 정책 확정
  - 프리토킹 스텝 유형 5가지 확정
    (word_listen_repeat → word_k2e → 
     sentence_listen_repeat → sentence_k2e → free_talk)
  - K2E 기능 설계
  - 시나리오 자동 생성 + 미리보기/수정 흐름
  - 학생 무응답 처리 (2회 경고, 3회 선생님 알림)
  - 음성 저장 정책
  - 복습/숙제 기능 설계
  - conversation_logs 통합 설계

### phoneme API (HuggingFace)
- /api/phoneme 엔드포인트 생성
- HuggingFace wav2vec2 모델 연동 시도
- Codespaces/Vercel 네트워크 제한으로 보류
  (api-inference.huggingface.co 도메인 차단)
- Mac Mini M4 구축 후 로컬 운영으로 재시도 예정

### 향후 논의 완료 사항
- 학생 발화 피드백: 현재 GPT 텍스트 기반
- 음성 저장: Supabase Storage → AWS S3/Cloudflare R2 검토
- 학부모 공유: 차후 논의
- 토큰 관리: 차후 논의
- 복습/숙제: 차후 구현

### 다음 우선순위
1. 자습/수업 화면 통합 (로그인 시 자동 수업 참여)
2. 마이크 버튼 활성화 정책 구현
3. 시나리오 자동 생성 API (/api/classroom/generate-scenario)
4. 선생님 화면 스텝 패널 (반복/건너뜀/수정)
5. conversation_logs 교실 수업 필드 추가
