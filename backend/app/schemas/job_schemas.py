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
    queue_position: int | None = None
    active_job_progress: int | None = None

    model_config = {"from_attributes": True}


class JobWithVideoResponse(BaseModel):
    id: uuid.UUID
    video_id: uuid.UUID
    video_name: str
    video_duration: float | None
    status: str
    progress: int
    error_message: str | None
    started_at: datetime | None
    finished_at: datetime | None
    created_at: datetime
