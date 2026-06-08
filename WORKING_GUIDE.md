# AI Co-Teacher 작업 방식 가이드

## 개요

이 프로젝트는 Claude(AI)와 사람이 함께 대화하며 개발합니다.
Claude가 코드를 작성하고, 사람이 터미널에 복사/붙여넣기로 실행하고,
결과를 Claude에게 보여주는 방식으로 진행합니다.

---

## 작업 환경

- **GitHub**: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher (public)
- **Codespaces 경로**: /workspaces/ai-co-teacher/
- **배포**: Vercel (git push 하면 자동 배포)
- **터미널**: GitHub Codespaces 브라우저 터미널 사용

---

## 협업 방식

### 1. 아이디어 논의
사람이 기능 아이디어를 제안하면 Claude가 기술적 방향을 분석하고,
방향이 결정되면 기획서 작성 또는 바로 코딩을 시작합니다.

### 2. 코딩
Claude가 터미널 명령어나 python3 스크립트를 제공하면,
사람이 그대로 복사해서 Codespaces 터미널에 붙여넣고 실행합니다.
실행 결과를 Claude에게 다시 붙여넣어 공유하면
Claude가 결과를 확인하고 다음 단계를 진행하거나 오류를 수정합니다.

### 3. 빌드 확인 (필수)
```bash
cd /workspaces/ai-co-teacher/frontend && npm run build 2>&1 | tail -15
```
빌드 성공 확인 후 커밋합니다.

### 4. 커밋/푸시
```bash
cd /workspaces/ai-co-teacher
git add -A
git commit -m "feat: 기능명 (v2026-06-06.버전번호)"
git push
```
Vercel이 자동으로 배포합니다 (1~2분 소요).

---

## 코드 수정 방법

### 방법 1: python3 스크립트 (주로 사용)
파일 내용을 읽어서 특정 문자열을 교체하는 방식입니다.
### 방법 2: python3 heredoc (새 파일 생성)
긴 파일을 새로 만들 때 python3으로 직접 씁니다.
cat heredoc은 따옴표 등 특수문자가 잘릴 수 있어서 python3을 선호합니다.

### 방법 3: 파일 내용 확인
```bash
sed -n '1500,1520p' 파일경로   # 특정 줄 보기
grep -n "찾을내용" 파일경로     # 내용 찾기
wc -l 파일경로                  # 전체 줄 수
```

---

## 버전 관리 규칙

형식: v{날짜}.{순번} (예: v2026-06-06.15)
같은 날 여러 번 배포 시 순번 +1, 날짜 바뀌면 .1부터 시작.

버전 업데이트는 매 커밋마다 frontend/lib/version.ts 수정:
```bash
python3 -c "
with open('/workspaces/ai-co-teacher/frontend/lib/version.ts', 'w') as f:
    f.write(\"export const APP_VERSION = 'v2026-06-06.XX'\\n\")
"
```

---

## 문서 업데이트 규칙

매 작업 완료 시:
- FILE_MAP.md: 새 파일 추가/변경 시 업데이트
- CHANGELOG.md: 변경 이력 추가
- SESSION_SUMMARY.md: 세션 종료 전 오늘 작업 요약

새 세션 시작 시 Claude에게 아래를 공유하면 이전 작업을 이어갈 수 있습니다:
- SESSION_SUMMARY.md
- CLAUDE.md
- CHANGELOG.md
- FILE_MAP.md
- WORKING_GUIDE.md
- GitHub URL: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher

---

## 주의사항

- 파일 다운로드 방식 절대 금지 - 터미널 명령어로만 수정
- 빌드 확인 필수 - 커밋 전 반드시 빌드 성공 확인
- 민감 정보 주의 - API 키는 console.log 금지
- 코드 보존 - 기능 비활성화 시 삭제 말고 주석/false 처리
- 버전 번호 포함 - 커밋 메시지에 버전 번호 항상 포함

---

## 트러블슈팅

빌드 오류 시:
```bash
npm run build 2>&1 | grep "error\|Error\|Type" | head -10
```

코드 수정 실패(찾지 못함) 시:
```bash
grep -n "찾을내용" 파일경로
sed -n '{줄번호},{줄번호}p' 파일경로
```

---

## 실전에서 배운 팁

### 코드 수정 시 주의사항

**heredoc (<<'EOF') 방식은 따옴표/특수문자가 잘릴 수 있음**
- 긴 파일 생성 시 python3 << 'PYEOF' 방식 사용
- 단순 텍스트 파일은 heredoc도 OK
- TypeScript/JSX 코드는 반드시 python3으로

**python3 -c 방식은 ! 문자 오류 발생**
- bash에서 !는 히스토리 확장 문자
- python3 << 'PYEOF' 방식 사용 권장

**str.replace() 찾지 못할 때**
- 실제 파일 내용과 공백/줄바꿈 차이 확인
- grep -n "찾을내용" 파일경로 로 정확한 위치 확인
- sed -n '{줄번호}p' 파일경로 로 실제 내용 확인

---

### Next.js 라우팅 주의사항

**(teacher), (student) 폴더 그룹은 URL에 포함 안 됨**
- (teacher)/classroom/page.tsx -> /classroom (의도와 다름)
- (teacher)/teacher/classroom/page.tsx -> /teacher/classroom (정상)
- student/classroom/page.tsx -> /student/classroom (정상)

**빌드 결과에서 라우팅 확인 필수**
- npm run build 후 출력에서 경로 확인

---

### Supabase Realtime 주의사항

**새 테이블 만들면 Realtime 활성화 필수**
- ALTER PUBLICATION supabase_realtime ADD TABLE 테이블명;
- SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime';

**RLS 정책 없으면 INSERT 실패**
- ALTER TABLE 테이블명 ENABLE ROW LEVEL SECURITY;
- CREATE POLICY "authenticated can all" ON 테이블명 FOR ALL TO authenticated USING (true) WITH CHECK (true);

**.single() 대신 .limit(1) 사용**
- 결과가 여러 개일 때 .single()은 오류 발생
- .order('created_at', {ascending: false}).limit(1) 사용

---

### 네트워크 제한

**Codespaces에서 접근 불가 도메인**
- api-inference.huggingface.co -> 차단됨
- Mac Mini M4 로컬 서버로 대안

**Vercel 배포 환경변수**
- .env.local -> Vercel에 자동 반영 안 됨
- Vercel 대시보드 -> Settings -> Environment Variables 에서 직접 추가

---

### 새 세션 시작 시 Claude에게 전달할 파일

필수:
- SESSION_SUMMARY.md
- CLAUDE.md
- CHANGELOG.md
- FILE_MAP.md
- WORKING_GUIDE.md

선택 (관련 작업 시):
- classroom-v8-spec.md
- GitHub URL: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher

---

## 새 세션 시작 프롬프트

새 창에서 아래 내용을 그대로 붙여넣으면 이전 작업을 이어갈 수 있습니다:
아래 파일들을 읽고 프로젝트 현황을 파악해줘:
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/SESSION_SUMMARY.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/CLAUDE.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/CHANGELOG.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/MODULE_MAP.md
https://raw.githubusercontent.com/AHN-MYEONG-SEOP/ai-co-teacher/main/WORKING_GUIDE.md

GitHub: https://github.com/AHN-MYEONG-SEOP/ai-co-teacher
Codespaces 경로: /workspaces/ai-co-teacher/
현재 버전: v2026-06-08.10

작업 방식:
- 코드 수정은 터미널 python3 스크립트로 직접 수정
- 수정 전 MODULE_MAP.md 반드시 참조
- 수정 후 cd frontend && npm run build 로 빌드 확인
- 빌드 성공하면 git add, commit, push
- 커밋 메시지에 버전 번호 포함
- frontend/lib/version.ts의 APP_VERSION도 함께 업데이트
- 파일을 다운로드해서 넣으라고 하지 말고 터미널 명령어로 직접 수정

---

## md파일 일괄 업데이트 방법

세션 종료 전 아래 한 마디만 하면 됩니다:

    "지금까지 수정된 내용을 md파일에 반영해줘"

Claude가 자동으로:
- MODULE_MAP.md 줄 번호/함수명 업데이트
- CHANGELOG.md 변경 이력 추가
- SESSION_SUMMARY.md 오늘 작업 요약
- docs/ 설계 변경 사항 표시
- git add -A && commit && push
