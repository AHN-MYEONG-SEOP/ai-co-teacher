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
- AI 선생님: Coty (코티) — CLAUDE.md 기준 (지시서의 Junny 아님)
- 대상: 오프라인 영어 학원 최대 8명

---

## 오늘 세션(2026-06-03) 완료한 작업

### 1. 시나리오 JSON 설계 및 생성
- Insight Builder 1 Unit 1~3 시나리오 JSON 파일 설계 완료
- 구조: phases[] → steps[] (target_word, accept_variants, hint_line, reaction 포함)
- 3단계 Phase 구성: AI 주도 → AI 주도(난이도 상승) → 학생 주도(역할 전환)
- gpt_rules 포함 (flow, counting_rules, response_format)

### 2. DB 스키마 생성 및 데이터 INSERT 완료
- lesson_scenarios 테이블 신규 생성 (기존 동명 테이블은 lesson_sessions로 rename)
- lesson_progress 테이블 신규 생성
- student_lesson_summary 뷰 생성
- realtime_lesson_status 뷰 → lesson_sessions 참조로 재생성
- Unit 1 School, Unit 2 Family, Unit 3 Birthdays INSERT 완료

### 3. system-prompt.ts 완성 (v2026-06-03.8)
- buildSystemPrompt에 currentStep 4번째 파라미터 추가
- 현재 도전 중인 step 번호, 목표 단어, 기대 답안, accept_variants 프롬프트에 명시
- 오답/단답/불완전 문장 시 step_completed = null 보수적 판단 규칙 추가
- chat/route.ts: attemptingStep = progressData?.current_step ?? 1 추출 후 전달

### 4. 버그 수정 및 배포
- v2026-06-03.8 커밋 및 Vercel 배포 완료
- CHANGELOG.md 업데이트 완료

---

## 오늘 대화에서 확정된 설계 결정사항

### 시나리오 관리 방식
- 원본 소스: JSON 파일 (설계/검토용)
- 실제 운영: Supabase DB (앱이 로드하는 곳)
- GPT 참조: DB에서 로드한 데이터를 system prompt에 주입

### 지침(System Prompt) 관리
- 위치: frontend/prompts/system-prompt.ts (코드로 관리)
- DB 이관: 시스템 안정화 후 검토 (현재 보류)

### 에이전트 시스템 (논의 중, 미구현)
- Student Agent: 학생처럼 대화하는 에이전트 (테스트/시뮬레이션용)
- Analysis Agent: 대화 품질 분석 에이전트
- 각 에이전트별 system prompt 필요

### 학생 목소리 추가 (논의 중, 미구현)
- 현재: AI Teacher(Coty)만 ElevenLabs TTS 사용
- 후보: ElevenLabs The Kid (Voice ID: qHjcDL87pelA6RkUz0Ij)
- 설정 파일: frontend/config/voices.ts 생성 예정

### 비용 대시보드 (논의 중, 미구현)
- 추적 대상: Deepgram(초), GPT(토큰), ElevenLabs(문자수)
- 저장: usage_logs 테이블 추가 필요
- 교사 대시보드에 탭 추가 예정

---

## Claude Code 상황

- 상태: API usage limit 도달로 사용 불가
- 원인: claude-opus-4-8 모델로 토큰 1억+ 사용 → $100.69 지출
- 크레딧 잔액: $12.41 (부족)
- 초기화: 2026-07-01 00:00 UTC (한국시간 7월 1일 오전 9시)
- 재시작 시: Sonnet 모델로 변경 필수
- settings.json에 추가: { "model": "claude-sonnet-4-5-20251001" }

---

## 현재 작업 방식 (Claude Code 없이)

- GitHub 저장소 public으로 공개됨 → Claude가 직접 읽을 수 있음
- 작업 흐름: Claude가 코드 설계/작성 → 사용자가 터미널에서 수정+커밋+푸시
- CHANGELOG.md는 sed 명령으로 업데이트하는 방식 확립

---

## 다음 할 일 (우선순위)

1순위: 실제 테스트
   - 학생으로 로그인 후 Unit 1 School 수업 진행
   - 오답 입력 시 scene_kr이 노출되지 않는지 확인
   - step 완료 판정이 정확한지 확인

2순위: usage_logs 테이블 + 비용 대시보드
   - DB 테이블 설계
   - chat/route.ts에 토큰 사용량 저장 로직 추가
   - 교사 대시보드에 탭 추가

3순위: 에이전트 시스템
   - Student Agent system prompt 작성
   - Analysis Agent system prompt 작성
   - Orchestrator 로직 설계

4순위: 학생 목소리
   - ElevenLabs Voice Library에서 어린이 목소리 선택
   - frontend/config/voices.ts 생성
   - TTS route에서 화자별 voice_id 분기 처리

5순위: Insight Builder 2 이상 시나리오 작성
   - 교재 구성.xlsx 참고
   - Unit별 JSON 파일 작성 → DB INSERT

---

## 참고: 주요 파일 경로

- frontend/prompts/system-prompt.ts   ← GPT 지침 빌더
- frontend/lib/lesson.ts              ← progressRate, pushUnique 등 헬퍼
- frontend/app/api/chat/route.ts      ← 메인 대화 처리
- frontend/app/api/lesson-scenario/   ← 시나리오 로드/회차 생성
- frontend/app/api/persona/           ← 페르소나 조회/업데이트
- frontend/app/(student)/page.tsx     ← 학생 화면
- frontend/app/(teacher)/teacher/     ← 교사 대시보드

---

## 오늘 세션 특이사항

- GitHub 저장소를 public으로 변경함 (Claude가 직접 읽을 수 있음)
- Claude Code 없이 Claude(claude.ai)와 직접 작업하는 방식으로 전환
- 작업 완료 후 CHANGELOG.md를 sed 명령으로 업데이트하는 방식 확립
- version.ts의 APP_VERSION을 커밋 메시지에 표기하는 규칙 유지
