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
    queue_position: int | None = None       # position in queue (1 = next up), None when not queued
    active_job_progress: int | None = None  # progress of the job currently being transcribed

    model_config = {"from_attributes": True}
