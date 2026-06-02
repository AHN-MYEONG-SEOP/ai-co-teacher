# CHANGELOG — AI Co-Teacher

> 자주 바뀌는 내용은 여기에 기록합니다.
> 작업 완료 시 Claude Code에게 "CHANGELOG.md 업데이트해줘" 라고 하면 됩니다.

---

## 현재 상태 (2026-06-01)

### 반영 필요한 파일들
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

### 현재 미결 사항 (TBD)

| 항목 | 상태 | 비고 |
|------|------|------|
| Path A/B Hybrid STT | Deepgram 단일 경로 운영 중 | Mac Mini 전환 시 구현 |
| 회화 모드 앱 분리 | 학습 모드 안정화 후 별도 앱으로 분리 예정 | - |
| 교사 대시보드 학생별 Book/Unit 지정 | 미구현 | 다음 스프린트 |
| Mac Mini 로컬 전환 | API 비용 월 10만 원 초과 시 | - |
| 8명 동시 접속 Queue | 미구현 | 부하 테스트 후 |

---

### 최근 추가된 기능

- [x] **수업 종료 흐름 개편 + 복습/종료 카드 (2026-06-02, v2026-06-02.8)** — 모든 step 완료 → Coty 마무리 인사 → 자동으로 복습/종료 선택 카드.
  - **마무리 메시지 영어화**: 종료 문장을 `That's all for today's conversation. 👋` 로 변경(기존 한국어 `오늘 대화는 여기까지입니다`). `system-prompt.ts` 지침 + `chat/route.ts`의 `SESSION_END_MARK` 동기화. 감지는 아포스트로피/대소문자 무시 매칭.
  - **종료 카드 타이밍**: step 완료 즉시 카드를 띄우지 않고, 마무리 인사 2턴(`sessionEnded`)이 끝난 뒤 표시. `useConversation`에서 `setSessionEnded`를 closing 메시지 표시·TTS 이후로 이동.
  - **진행도 100%**: 회차의 모든 step 완료 시 힌트 사용과 무관하게 진행률 바를 100%로 표시(`useConversation` `progress` 강제 100). 학습 결과는 기존대로 `lesson_progress`/`lesson_report`에 저장.
  - **카드 통합(`ConfirmStartCard`)**: 로그인 직후·수업 완료 후 동일 카드 사용. 문구 `오늘 배울 내용이에요`→`지난 시간에 배운 내용이에요`, 버튼 `🚀 시작하기`→`🔁 복습하기`. `🚪 종료` 버튼 추가(누르면 로그아웃: `clearMessages`+`sessionStorage.clear`+`signOut`+`/login`).
  - **제거**: 기존 `UnitCompleteCard`(🎉 Unit 완료! / 한 번 더 / 다음 Unit / 오늘은 끝내기) 및 `lessonState 'choosing'`·`finishToday`·`endSession` 사용 제거.
- [x] **🐞 FIX: 진행률 바가 안 나오던 버그 (2026-06-02)** — 마이크 화면에서 진행률 바가 사라지던 문제. **원인**: 회차 모델 도입 시 새 제약 `lesson_progress_attempt_uniq`(…·attempt)만 추가하고 **옛 제약 `lesson_progress_unique_session`(student_id, scenario_id, session_date)을 DROP하지 않음** → 같은 날 같은 Unit 두 번째 회차 시작 시 INSERT가 `23505 duplicate key`로 실패 → 회차 행 미생성·`progressId=null` → `activeScenario`가 null로 덮여 바 사라짐.
  - **조치**: `db/2026-06-02_drop_old_unique_session.sql`을 Supabase SQL Editor에서 실행해 옛 제약/인덱스 제거. (`db/2026-06-02_lesson_progress_attempt.sql`의 DROP 블록이 누락 실행된 환경 보정)
  - **코드 보강**: `page.tsx`의 `startAttempt` — POST 실패 시에도 같은 단원이면 직전 `activeScenario`를 유지해 진도 바가 사라지지 않도록 방어(`data.scenario` 있을 때만 덮어쓰기).
- [x] **회차(attempt) 모델 + 수업 시작/완료 선택 흐름 (2026-06-02, v2026-06-02.6)** — 로그인/로그아웃마다 진도율을 새 회차로 시작하되 기존 자료는 모두 누적 보존. 진도율 바 위에 `N번째 진행 · ✅ 완료 X회` 표시.
  - **DB**: `lesson_progress.attempt integer` 컬럼 추가 → 날짜당 1행 → **회차당 1행**. (`db/2026-06-02_lesson_progress_attempt.sql` 실행 필요. (학생·시나리오·날짜) 유니크 제약 제거 후 (…·attempt) 재설정)
  - **흐름**: ① 로그인 직후 `ConfirmStartCard` — 오늘 Book/Unit 안내 + `🚀 시작하기` / `📖 다른 Unit 고르기`(`BookUnitPickerCard`). ② Unit 모든 step 완료 시 `UnitCompleteCard` — `🔁 한 번 더` / `➡️ 다음 Unit(직접 고르기)` / `👋 오늘은 끝내기`.
  - `lesson-scenario/route.ts` — GET은 **행 생성 없이** 시나리오 + 회차 통계(`attempt_count`/`completed_count`) + (progress_id 주면) 이어할 회차 반환. `POST {action:'start'}`가 새 회차 행 생성(`attempt = max+1`).
  - `chat/route.ts` — 진도 갱신을 (날짜) 대신 **회차 행 `progressId`** 기준 UPDATE. 같은 날 여러 회차 공존해도 정확한 행만 갱신.
  - `useConversation.ts` — 자동 인사 제거, 수동 `start()`/`reset()`/`endSession()` + `onUnitComplete` 콜백 + `progressId` 전달. 회차마다 새 리포트.
  - `useStudentSession.ts` — 시나리오/진도 자동 로드·생성 제거(page가 회차 모델로 직접 관리), `ready` 플래그 추가. 시나리오 오케스트레이션은 `page.tsx`로 이관.
  - **이어하기**: 새로고침 시 `sessionStorage(activeProgressId/activeBook/activeUnit)`로 진행 중 회차 복구(인사·회차 생성 없음). 로그아웃(`NavBar`의 `sessionStorage.clear()`)·탭 종료 시 다음 로그인은 새 회차.
- [x] **진도·로그·리포트 누적 보존 정책 확정 (2026-06-02)** — 로그아웃해도 DB의 `lesson_progress`/`conversation_logs`/`lesson_reports`는 삭제하지 않고 그대로 누적. (한때 추가했던 `reset-progress` 엔드포인트와 로그아웃 삭제 로직은 제거) `NavBar.handleLogout`은 화면용 대화창·sessionStorage만 초기화.
  - 같은 날 같은 Unit 재학습 → `lesson_progress` 같은 행에 `natural_steps` 누적
  - 같은 날 다른 Unit / 재로그인 → `lesson_reports` 새 `seq` 행으로 각각 보존
  - `study_logs`는 유닛·날짜당 1행(중복 방지) 유지
- [x] **클로징 2턴 매끄럽게 처리 + 세션 종료 UI (2026-06-02)**
  - `system-prompt.ts` closing 지침을 2턴 흐름으로 명확화. ① 모든 step 완료 후 첫 마무리 턴에서 칭찬 + "See you tomorrow!" 작별 인사 (종료 안 함, 학생 인사 대기) → ② 학생이 인사로 답하면 짧은 칭찬과 함께 message 끝에 한국어 `오늘 대화는 여기까지입니다.`를 덧붙여 종료 (영어 전용 규칙의 유일한 예외)
  - `chat/route.ts` — AI 응답에 종료 문장 포함 시 `session_ended: true` 반환 (`SESSION_END_MARK` 상수), 종료 턴에는 힌트 선택지 생략
  - `useConversation.ts` — `sessionEnded` 상태 노출, chat 응답의 `session_ended` 감지
  - `page.tsx` — 종료 시 마이크 버튼 비활성화(👋) + handleMicStart 가드 + 하단 안내문구 "오늘 수업이 끝났어요. 내일 또 만나요!" 전환
- [x] **📋 시나리오·지침 인스펙터 모달 (2026-06-02, 교사/운영자용)** — 학생 페이지 하단 `📋 시나리오 · 지침` 버튼 → 오늘 Unit의 전체 시나리오 대본(phase/step별 scene_kr·ai_line·expected_pattern·accept_variants·hint_line·reaction)과 AI 진행 지침(`gpt_rules.flow`/`counting_rules`)·마무리(closing)를 펼쳐 확인. 이미 로드된 `loadedScenario` 재사용(추가 fetch 없음), `{{nickname}}` 치환 미리보기. 시나리오 없는 교재는 폴백 안내.
- [x] **수업 시나리오 step 워크스루 v4.0 (2026-06-02)** — `lesson_scenarios`(공용 템플릿: `book_slug`/`phases`/`closing`/`gpt_rules`/`target_words`/`total_steps`) + `lesson_progress`(학생·시나리오·일자별 진도) 기반 선형 step 1..N 진행
  - `frontend/prompts/system-prompt.ts` 신규 — 시나리오/페르소나/닉네임 → Coty system prompt 빌더
  - `chat/route.ts` 전면 교체 — step 기반 엔진. 응답 `{ message, step_completed, hint_used, word_spoken_naturally, persona_update }` 파싱, `lesson_progress` 영속화. 템플릿 없는 교재는 일반 Coty 대화로 폴백
  - `lesson-scenario/route.ts` 전면 교체 — GET으로 템플릿 + 오늘 진도 로드/생성 (GPT 생성·`progress_state`·`expires_at` 폐기)
  - 진도율 = `natural_steps`(힌트 없이 스스로 말한 step) / `total_steps`
  - 📊 진행 모달 step 기반(✅ 스스로 / 💡 힌트 / ⬜ 미완)으로 개편
  - `frontend/lib/lesson.ts` 신규 — `kstToday`/`toBookSlug`/`progressRate`/`pushUnique` 공용 헬퍼
  - AI 이름은 **Coty** 유지 (지시서의 Junny 미채택)
- [x] 개인화 학습 시스템 v3.0 — 페르소나 자동 구축(`student_personas`) + 수업 시나리오 자동 생성(`lesson_scenarios`) + 자연 사용 3회 기반 진도율
- [x] `/api/persona`, `/api/lesson-scenario` 엔드포인트 추가
- [x] 학생 📊 진행 상황 모달 (단어/패턴별 달성 현황)
- [x] 교사 대시보드 — 반별 학생 필터 + 실시간 수업 진행률 + 👤 페르소나 탭
- [x] Deepgram HTTP Blob STT (WebSocket → HTTP 전환)
- [x] Web Audio 노이즈 제거 파이프라인
- [x] 단계별 대화 흐름 (greeting→weather→review→confirm_unit→study)
- [x] 교재 연동 (curriculum.json, 506 유닛)
- [x] 힌트 보기 버튼 (클릭 불가, 보기만)
- [x] 번역 보기 버튼
- [x] 🔁 다시듣기 버튼
- [x] 진행률 바 (GPT가 완성도 있는 답변 기준으로 판단)
- [x] hint_used DB 저장
- [x] lesson_reports 날짜별 학습 이력
- [x] 교사 대시보드 학습이력 탭
- [x] 설정 모달 Book/Unit 선택
- [x] 상세 콘솔 로그 (마이크 → Deepgram 전 과정)

---

### 알려진 버그 / 주의사항

- 인사말 중복 방지: `sessionStorage`로 greeted 여부 체크
- 빈 청크 문제: 200ms 대기 후 재확인, 그래도 없으면 무시 (fallback 없음)
- Vercel 빌드 시 `en-ipa` 패키지 절대 사용 금지
- ~~빠른 탭 시 녹음 유실: `startListening`(getUserMedia/AudioContext 준비) 완료 전 손을 떼면 `mrRef`가 비어 청크 없이 종료되고, 멈추지 않는 녹음기가 백그라운드에 잔류~~ → **수정됨 (2026-06): `startPromiseRef`로 준비 완료를 stopListening이 대기**

---

## 변경 이력

### 2026-06
- **keyword boosting 핵심어 확대** (v2026-06-01.11): 기존 Unit target 단어에 더해 ① 시나리오 stage 타깃 ② **AI가 방금 던진 질문 속 핵심어**까지 Deepgram `keywords`에 포함. 학생이 다음에 말할 가능성이 높은 단어를 그 턴마다 동적으로 부스트 → 답변 인식 정확도↑. 흔한 기능어(the/you/what 등)는 stopword로 제외, 3글자 이상 알파벳 토큰만 추출
- **Deepgram `nova-2`로 복귀 + keyword boosting(문맥 힌트) 도입** (v2026-06-01.10): conversational 변형 모델은 인식 품질이 오히려 떨어져 기본 `nova-2`로 되돌림. 대신 **연음/구어체 인식 보완**을 위해 오늘 Unit의 target 단어를 Deepgram `keywords` 파라미터(keyword boosting, `word:2`)로 전달 → 발음이 다소 뭉개져도 해당 단어로 인식될 확률↑. `useWebSpeech`에 `keywords` 옵션 추가, 학생 화면이 `useCurriculum.getUnitData`로 현재 Unit 단어를 추출해 주입 (최대 80개, `,`/`/` 분리·중복 제거)
- ~~Deepgram 모델 `nova-2-conversationalai`로 변경~~ → 인식 저하로 롤백. (그 전 `nova-2-conversational`은 존재하지 않는 모델명이라 **403** 발생했던 이력)
- **개인화 학습 시스템 v3.0 도입 (페르소나 + 시나리오 + 자연 사용 기반 진도율)** — `LEARNING_SYSTEM_DESIGN.md` 기준 구현 (v2026-06-01.9):
  - **페르소나 API** `/api/persona` (GET 조회 / POST 누적 merge). 배열=합집합, 객체=재귀병합, free_facts 합집합. 별도 호출 없이 chat 응답의 `persona_update`로 자동 누적
  - **시나리오 API** `/api/lesson-scenario` (POST generate / GET 조회 / POST `?action=update_progress`). 로그인 직후 백그라운드로 GPT가 오늘 Unit + 페르소나 기반 수업 시나리오 생성 → `lesson_scenarios`에 저장. 같은 book/unit ready 시나리오는 중복 생성 방지(재사용), 새로 생성 시 이전 ready는 expired 처리, 24시간 만료
  - **chat/route.ts 전면 개편**: 대화 GPT 호출이 `response_format: json_object`로 `{ text, stage_progress, persona_update }` 반환. 시스템 프롬프트에 학생 주도 유도 규칙(5 techniques) + 페르소나 + 시나리오 + 미완료 target(pendingTargets) 주입. 기존 별도 진도율 GPT 호출 제거 → 진도는 stage_progress 기반으로 클라이언트가 계산
  - **진도율 = 자연스럽게 3회 사용 시 완료**: `useConversation`이 `progress_state`(stage별 current_count/completed/usage_log) 관리. 힌트 보고 말한 것(`meta.hintUsed` 또는 `hint_used`)은 카운트 제외. 단어/패턴 변형 인정(matchStage). 완료 가중치 합으로 0~100 정규화, `/api/lesson-scenario` update_progress로 실시간 저장
  - **학생 화면 📊 진행 상황 모달**: 단어/패턴별 달성 현황(✅3회/🔄n회/⬜)과 usage_log 표시. 진행률 바 옆 📊 버튼으로 진입
  - **교사 대시보드**: 본인 반 학생만 조회(teacher_id→classes→profiles), 🔴실시간 탭에 학생별 수업 진행률 바 + stage 현황 추가(lesson_scenarios realtime 구독), 👤페르소나 탭 신규(관심사/가족/취약점/꿈/알려진 사실 카드)
- **피드백(점수/교정/팁) 미표시 버그 수정**: 피드백 route가 `JSON.parse`를 마크다운 제거 없이 해서, gpt-4o-mini가 ```json 으로 감싸면 파싱 실패 → 500 → 피드백 미부착. 백틱 펜스 제거 후 파싱하도록 수정. 실패 시 클라이언트 콘솔에 진단 로그 추가
- **마이크 스트림 예열(warm) — 발화 앞부분 잘림 해결**: 기존엔 누를 때마다 getUserMedia를 새로 호출해 ~0.5~1초 동안 녹음이 안 돼 앞부분이 잘림. 이제 마운트 시 스트림+AudioContext를 한 번 예열(`prepare`)하고 세션 내내 유지(warm) → 마이크 누르면 녹음기만 즉시 시작. 설정 변경/트랙 종료 시에만 재예열. 단일 컨텍스트 유지로 AudioContext 누수도 원천 해소. `isReady` 노출. (단점: 수업 중 마이크 표시등 상시 켜짐)
- **"녹음 데이터 없음" 반복 버그 수정 (AudioContext 누수)**: `useWebSpeech`가 매 녹음마다 `new AudioContext()`를 만들고 close/resume하지 않아, 컨텍스트가 누적되거나 suspended되면 가공 스트림이 무음 → 청크 0개가 되던 문제. 마이크 누를 때 이전 오디오 자원을 정리(`teardownAudio`)하고 컨텍스트를 `resume()`, stopListening에서 `close()` 추가
- **힌트 버튼 항상 표시**: choices 생성을 특정 phase(study/review/confirm_unit/weather) 조건에서 모든 phase로 확장 + greeting(인사/날씨) 메시지에도 힌트 추가. `generateChoices` 헬퍼로 통합 (clarify 되묻기는 제외)
- **원본 재생 버튼 미동작 버그 수정**: useWebSpeech가 공유 스트림 트랙을 먼저 종료해 useMediaRecorder의 녹음기가 이미 `inactive` 상태가 되면 `discardBlob`의 `onstop`이 안 터져 원본 blob이 저장되지 않던 문제. inactive인 경우 모아둔 청크로 즉시 저장하도록 수정
- 오디오 가공 진단 기능 추가:
  - 재생 버튼 2개 — **원본**(필터 미적용 raw 마이크) / **가공본**(Deepgram에 실제 전송된 음성). 인식 실패(conf 0.00) 원인이 마이크인지 가공 과다인지 귀로 진단 가능
  - 🎛️ 오디오 가공 설정 모달 — HighPass/LowPass/Compressor + 브라우저 내장 처리(echo/noise/gain)를 토글·슬라이더로 조절, localStorage 저장 (`store/audioConfigStore.ts`)
  - `useWebSpeech`가 설정값으로 Web Audio 파이프라인을 동적 구성하고 가공본 blob을 재생용으로 노출 (`lastProcessedBlobUrl`)
- 커밋 메시지 제목에 `(v{APP_VERSION})` 표기 규칙 추가 → Vercel 배포 목록에서 버전 식별
- 배포 버전 표시 추가: `frontend/lib/version.ts`의 `APP_VERSION`(일자.순번)을 NavBar 상단에 표시 → 배포 반영 여부 확인용. **배포할 때마다 순번 갱신 필수**
- 학생 발화 중복 전달 버그 수정 (chat route): useConversation이 이미 messages 끝에 현재 발화를 넣어 보내는데 route에서 또 append → GPT가 같은 말을 두 번 본 문제. 대화 메시지 + 진행률 계산 입력 양쪽 수정
- 빠른 탭 녹음 유실 race condition 수정 (useWebSpeech: start/stop 동기화)
- lesson_reports 테이블 추가 (날짜별 seq 포함)
- hint_used 컬럼 conversation_logs에 추가
- show_translation 컬럼 profiles에 추가 (현재 미사용)
- curriculum.json 생성 (엑셀 파싱, 506 유닛)
- CLAUDE.md + CHANGELOG.md 분리

### 2026-05
- 프로젝트 초기 구현
- Deepgram HTTP Blob STT 전환
- ElevenLabs TTS 연동
- Supabase Auth + DB 연동
