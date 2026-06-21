import uuid
from datetime import datetime

from pydantic import BaseModel


class VideoResponse(BaseModel):
    id: uuid.UUID
    original_name: str
    content_type: str
    size_bytes: int
    duration_seconds: float | None
    status: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
