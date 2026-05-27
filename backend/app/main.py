from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import router as v1_router
from app.core.config import settings
from app.models.stt import ModelInfoResponse

app = FastAPI(
    title="AI Co-Teacher — Whisper Fallback Server",
    description="Path B STT Fallback: Web Speech API confidence < 0.85 처리",
    version="1.0.0",
)

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 라우터 등록
app.include_router(v1_router)


@app.get("/health")
async def health_check() -> dict:
    return {
        "status": "ok",
        "backend": settings.whisper_backend,
        "model": settings.whisper_model_size,
    }


@app.get("/api/v1/model-info", response_model=ModelInfoResponse)
async def model_info() -> ModelInfoResponse:
    return ModelInfoResponse(
        model_size=settings.whisper_model_size,
        backend=settings.whisper_backend,
        avg_latency_ms=None,  # TODO: 실측 후 업데이트
    )
