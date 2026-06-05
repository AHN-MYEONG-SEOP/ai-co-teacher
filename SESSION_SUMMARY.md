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

---

## 오늘 세션(2026-06-03) 완료한 작업

### 시나리오 시스템
- Insight Builder 1 Unit 1~3 시나리오 JSON 설계 완료
- lesson_scenarios 테이블 신규 생성 (기존 동명 테이블은 lesson_sessions로 rename)
- lesson_progress 테이블 신규 생성
- Unit 1 School, Unit 2 Family, Unit 3 Birthdays DB INSERT 완료

### 힌트 시스템 개선 (v2026-06-03.9~11)
- generateChoices(GPT 즉석 생성) 제거 → 시나리오 hint_line + accept_variants 직접 사용
- HintBox UI 단계적 표시: 힌트 보기 → hint_line → 가능한 답변 보기 → accept_variants
- hint step 기준 수정: 완료 턴은 다음 step, 오답 턴은 현재 step 기준

### system-prompt.ts 개선 (v2026-06-03.12)
- 공통 규칙을 코드로 통합, DB gpt_rules.flow는 수업별 특이사항만 관리
- ai_line 강제 사용 규칙 추가
- 질문으로 끝맺음 강제
- 오답 시 이유 설명 후 재시도 유도
- step_completed 판정 유연화: 축약형 인정, target_word 포함 시 인정
- 시나리오 인스펙터 모달에 공통 지침 섹션 추가

### feedback 시스템 개선 (v2026-06-03.13)
- /api/feedback(GPT 별도 호출) 제거 → chat 응답에 통합
- GPT 호출 1회 절감 + 문맥 기반 정확한 분석
- feedback 구조: grammar, overall, retry_reason (오답 시 한국어로 이유 설명)
- DB: conversation_logs.correction → retry_reason 컬럼명 변경, tip 컬럼 제거
- FeedbackCard UI: fluency/vocabulary 제거, grammar + overall + retry_reason만 표시

---

## 확정된 설계 결정사항

### 지침 관리 방식
- system-prompt.ts: 모든 수업 공통 규칙 (코드로 관리)
- DB gpt_rules.flow: 수업별 특이사항만 (예: phase 3 역할 전환)
- DB gpt_rules.counting_rules: 진도 카운트 기준

### 시나리오 관리
- 원본: JSON 파일 (설계/검토용)
- 운영: Supabase DB (앱이 로드)
- GPT 참조: DB에서 로드한 데이터를 system prompt에 주입

### 힌트 시스템
- 힌트 버튼 클릭 1: hint_line 표시 (학생이 생각할 수 있는 클루)
- 힌트 버튼 클릭 2: accept_variants 표시 (가능한 답변, 말로만)
- GPT가 직접 생성하던 choices 완전 제거

### feedback 시스템
- chat/route.ts에서 GPT 응답에 feedback 포함
- /api/feedback 라우트 제거
- retry_reason: 오답 시에만 한국어로 틀린 이유 설명

---

## Claude Code 상황

- 상태: API usage limit 도달로 사용 불가
- 원인: claude-opus-4-8 모델로 토큰 1억+ 사용
- 초기화: 2026-07-01 00:00 UTC (한국시간 7월 1일 오전 9시)
- 재시작 시: Sonnet 모델로 변경 필수
- settings.json: { "model": "claude-sonnet-4-5-20251001" }

---

## 현재 작업 방식

- GitHub 저장소 public 공개 (Claude가 직접 읽을 수 있음)
- Claude가 코드 설계/작성 → 사용자가 터미널에서 수정+커밋+푸시
- 버전 관리: frontend/lib/version.ts에서 APP_VERSION 수동 갱신
- CHANGELOG.md: sed 명령으로 업데이트

---

## 다음 할 일 (우선순위)

1순위: 실제 테스트 및 버그 수정
   - 수업 진행 시 ai_line 준수 여부 확인
   - step 완료 판정 정확도 확인
   - retry_reason이 자연스럽게 말로 나오는지 확인

2순위: usage_logs 테이블 + 비용 대시보드
   - DB 테이블 설계
   - Deepgram/GPT/ElevenLabs 사용량 추적
   - 학생별/세션별 비용 집계
   - 교사 대시보드에 탭 추가

3순위: 에이전트 시스템 (논의 중)
   - Student Agent: 학생처럼 대화 (테스트/시뮬레이션용)
   - Analysis Agent: 대화 품질 분석
   - 각 에이전트별 system prompt 필요

4순위: 학생 목소리 추가
   - ElevenLabs Voice Library에서 어린이 목소리 선택
   - frontend/config/voices.ts 생성
   - TTS route에서 화자별 voice_id 분기

5순위: Insight Builder 2 이상 시나리오 작성

---

## 주요 파일 경로

- frontend/prompts/system-prompt.ts   - GPT 지침 빌더 (공통 규칙 포함)
- frontend/lib/lesson.ts              - progressRate, pushUnique 등 헬퍼
- frontend/app/api/chat/route.ts      - 메인 대화 처리 + feedback 통합
- frontend/app/api/lesson-scenario/   - 시나리오 로드/회차 생성
- frontend/app/api/persona/           - 페르소나 조회/업데이트
- frontend/app/(student)/page.tsx     - 학생 화면
- frontend/app/(teacher)/teacher/     - 교사 대시보드
- frontend/components/student/FeedbackCard.tsx - 피드백 UI

---

## DB 테이블 현황

- lesson_scenarios: 시나리오 원본 (Unit 1~3 데이터 포함)
- lesson_progress: 학생별 수업 진행 기록
- lesson_sessions: 기존 lesson_scenarios에서 rename (건드리지 말 것)
- conversation_logs: retry_reason 컬럼, tip 컬럼 제거됨
- student_personas: 학생 페르소나 정보

---

## 오늘 세션 특이사항

- Claude Code 없이 Claude(claude.ai)와 직접 작업하는 방식으로 진행
- GitHub public으로 공개되어 Claude가 직접 코드 읽을 수 있음
- /api/feedback 라우트는 코드에서 제거했지만 파일 자체는 남아있음 (나중에 삭제 가능)
