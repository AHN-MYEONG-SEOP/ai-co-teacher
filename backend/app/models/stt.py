from __future__ import annotations

from pydantic import BaseModel, Field


class STTResponse(BaseModel):
    text: str
    confidence: float = Field(ge=0.0, le=1.0)
    duration_ms: int

class STTErrorResponse(BaseModel):
    error: str
    message: str

class ModelInfoResponse(BaseModel):
    model_size: str
    backend: str
    avg_latency_ms: int | None = None
