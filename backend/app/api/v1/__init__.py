from fastapi import APIRouter
from app.api.v1 import stt

router = APIRouter(prefix="/api/v1")
router.include_router(stt.router, tags=["STT"])
