# AI Co-Teacher — SESSION SUMMARY
## 새 채팅방에서 이 파일을 업로드하면 이전 대화 내용을 이어갈 수 있습니다.

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
- 현재 버전: v2026-06-06.10

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
