from __future__ import annotations

import time
import openai

from app.core.config import settings
from app.models.stt import STTResponse


async def transcribe(audio_bytes: bytes, language: str = "en") -> STTResponse:
    """
    음성 데이터를 텍스트로 변환합니다.
    개발기: OpenAI Whisper API 사용
    상용기: whisper.cpp (Metal) 로컬 처리로 전환
    """
    if settings.whisper_backend == "openai":
        return await _transcribe_openai(audio_bytes, language)
    else:
        return await _transcribe_local(audio_bytes, language)


async def _transcribe_openai(audio_bytes: bytes, language: str) -> STTResponse:
    client = openai.AsyncOpenAI(api_key=settings.openai_api_key)

    start = time.monotonic()

    # OpenAI Whisper API 호출
    response = await client.audio.transcriptions.create(
        model="whisper-1",
        file=("audio.webm", audio_bytes, "audio/webm"),
        language=language,
        response_format="verbose_json",
    )

    duration_ms = int((time.monotonic() - start) * 1000)

    return STTResponse(
        text=response.text.strip(),
        confidence=0.95,  # OpenAI Whisper API는 confidence를 직접 반환하지 않음
        duration_ms=duration_ms,
    )


async def _transcribe_local(audio_bytes: bytes, language: str) -> STTResponse:
    """
    TODO (Week 6): whisper.cpp Metal 가속 로컬 추론 구현
    Mac Mini M4 상용기 전환 시 이 함수를 구현합니다.
    """
    raise NotImplementedError("로컬 Whisper는 Week 6에서 구현됩니다.")
