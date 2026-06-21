import uuid
from datetime import datetime

from pydantic import BaseModel


class CueCreate(BaseModel):
    start_ms: int
    end_ms: int
    text: str = ""


class CuePatch(BaseModel):
    start_ms: int | None = None
    end_ms: int | None = None
    text: str | None = None


class CueResponse(BaseModel):
    id: uuid.UUID
    video_id: uuid.UUID
    start_ms: int
    end_ms: int
    text: str
    position: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class BulkCuesRequest(BaseModel):
    cues: list[CueCreate]
