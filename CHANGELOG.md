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
