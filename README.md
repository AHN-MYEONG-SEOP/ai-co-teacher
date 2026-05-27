# 🤖 AI Co-Teacher

오프라인 영어 학원 1개 반(최대 8명)을 위한 **실시간 AI 말하기 코치 시스템**

## 빠른 시작

### 1. 환경변수 설정

```bash
cp .env.example frontend/.env.local
cp .env.example backend/.env
# 각 파일에서 실제 값 입력
```

### 2. Frontend 실행

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

### 3. Backend 실행

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000
```

### 4. Docker 통합 실행

```bash
docker-compose up --build
```

## 프로젝트 구조

```
ai-co-teacher/
├── frontend/     # Next.js 15 (App Router)
├── backend/      # FastAPI Whisper Fallback 서버
├── docs/         # 기획서 및 문서
└── CLAUDE.md     # Claude Code 개발 가이드라인
```

## 학생 화면

`http://localhost:3000` → 학생 말하기 연습 화면

## 교사 대시보드

`http://localhost:3000/teacher` → 실시간 모니터링 대시보드

## 기술 스택

- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, shadcn/ui, Zustand, Supabase
- **Backend**: FastAPI, Python 3.11+, OpenAI Whisper → whisper.cpp
- **배포**: Vercel (개발기) → Mac Mini M4 (상용기)
