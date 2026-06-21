"""In-memory fake repositories for unit testing — no database required."""
import uuid
from datetime import datetime, timezone

from app.models import Subtitle, TranscriptionJob, Video


class FakeVideoRepository:
    def __init__(self) -> None:
        self._store: dict[uuid.UUID, Video] = {}

    async def create(self, video: Video) -> Video:
        if video.id is None:
            video.id = uuid.uuid4()
        now = datetime.now(tz=timezone.utc)
        if not hasattr(video, "created_at") or video.created_at is None:
            video.created_at = now
        video.updated_at = now
        self._store[video.id] = video
        return video

    async def get_by_id(self, video_id: uuid.UUID) -> Video | None:
        return self._store.get(video_id)

    async def list_all(self) -> list[Video]:
        return sorted(self._store.values(), key=lambda v: v.created_at, reverse=True)

    async def update_status(self, video_id: uuid.UUID, status: str) -> Video | None:
        video = self._store.get(video_id)
        if video is None:
            return None
        video.status = status
        return video


class FakeJobRepository:
    def __init__(self) -> None:
        self._store: dict[uuid.UUID, TranscriptionJob] = {}

    async def create(self, job: TranscriptionJob) -> TranscriptionJob:
        if job.id is None:
            job.id = uuid.uuid4()
        now = datetime.now(tz=timezone.utc)
        job.created_at = now
        job.updated_at = now
        self._store[job.id] = job
        return job

    async def get_by_video_id(self, video_id: uuid.UUID) -> TranscriptionJob | None:
        jobs = [j for j in self._store.values() if j.video_id == video_id]
        if not jobs:
            return None
        return sorted(jobs, key=lambda j: j.created_at, reverse=True)[0]

    async def claim_queued(self) -> TranscriptionJob | None:
        queued = [j for j in self._store.values() if j.status == "queued"]
        if not queued:
            return None
        job = sorted(queued, key=lambda j: j.created_at)[0]
        job.status = "processing"
        job.started_at = datetime.now(tz=timezone.utc)
        return job

    async def update_progress(self, job_id: uuid.UUID, progress: int) -> None:
        job = self._store.get(job_id)
        if job:
            job.progress = progress

    async def mark_completed(self, job_id: uuid.UUID) -> None:
        job = self._store.get(job_id)
        if job:
            job.status = "completed"
            job.progress = 100
            job.finished_at = datetime.now(tz=timezone.utc)

    async def mark_failed(self, job_id: uuid.UUID, error: str) -> None:
        job = self._store.get(job_id)
        if job:
            job.status = "failed"
            job.error_message = error
            job.finished_at = datetime.now(tz=timezone.utc)

    async def reset_orphaned(self) -> None:
        for job in self._store.values():
            if job.status == "processing":
                job.status = "queued"
                job.started_at = None


class FakeSubtitleRepository:
    def __init__(self) -> None:
        self._store: dict[uuid.UUID, Subtitle] = {}

    async def create(self, subtitle: Subtitle) -> Subtitle:
        if subtitle.id is None:
            subtitle.id = uuid.uuid4()
        now = datetime.now(tz=timezone.utc)
        subtitle.created_at = now
        subtitle.updated_at = now
        self._store[subtitle.id] = subtitle
        return subtitle

    async def list_by_video(self, video_id: uuid.UUID) -> list[Subtitle]:
        subs = [s for s in self._store.values() if s.video_id == video_id]
        return sorted(subs, key=lambda s: s.start_ms)

    async def get_by_id(self, subtitle_id: uuid.UUID) -> Subtitle | None:
        return self._store.get(subtitle_id)

    async def update(self, subtitle: Subtitle) -> Subtitle:
        self._store[subtitle.id] = subtitle
        return subtitle

    async def delete(self, subtitle_id: uuid.UUID) -> None:
        self._store.pop(subtitle_id, None)

    async def bulk_replace(
        self, video_id: uuid.UUID, subtitles: list[Subtitle]
    ) -> list[Subtitle]:
        to_delete = [
            sid for sid, s in self._store.items() if s.video_id == video_id
        ]
        for sid in to_delete:
            del self._store[sid]
        for sub in subtitles:
            if sub.id is None:
                sub.id = uuid.uuid4()
            now = datetime.now(tz=timezone.utc)
            sub.created_at = now
            sub.updated_at = now
            self._store[sub.id] = sub
        return subtitles
