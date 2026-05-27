from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.models.stt import STTResponse
from app.services import whisper_service

router = APIRouter()


@router.post("/stt", response_model=STTResponse)
async def speech_to_text(
    audio_blob: UploadFile = File(..., description="WebM 또는 WAV 형식 음성 파일"),
    language: str = Form(default="en", description="언어 코드"),
) -> STTResponse:
    """
    Path B Fallback: 음성 Blob을 수신하여 Whisper로 정밀 변환합니다.
    Web Speech API confidence < 0.85 일 때 호출됩니다.
    """
    audio_bytes = await audio_blob.read()

    # 최소 길이 검증 (0.5초 = 약 8000 bytes WebM 기준)
    if len(audio_bytes) < 4000:
        raise HTTPException(
            status_code=422,
            detail={"error": "audio_too_short", "message": "최소 0.5초 이상의 음성이 필요합니다."},
        )

    return await whisper_service.transcribe(audio_bytes, language)
