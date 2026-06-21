import uuid
from datetime import datetime

from pydantic import BaseModel


class JobResponse(BaseModel):
    id: uuid.UUID
    video_id: uuid.UUID
    status: str
    progress: int
    error_message: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
