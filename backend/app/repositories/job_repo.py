import uuid
from datetime import datetime, timezone
from typing import Protocol

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TranscriptionJob


class JobRepositoryProtocol(Protocol):
    async def create(self, job: TranscriptionJob) -> TranscriptionJob: ...
    async def get_by_video_id(self, video_id: uuid.UUID) -> TranscriptionJob | None: ...
    async def claim_queued(self) -> TranscriptionJob | None: ...
    async def update_progress(self, job_id: uuid.UUID, progress: int) -> None: ...
    async def mark_completed(self, job_id: uuid.UUID) -> None: ...
    async def mark_failed(self, job_id: uuid.UUID, error: str) -> None: ...
    async def reset_orphaned(self) -> None: ...


class JobRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, job: TranscriptionJob) -> TranscriptionJob:
        self._session.add(job)
        await self._session.flush()
        await self._session.refresh(job)
        return job

    async def get_by_id(self, job_id: uuid.UUID) -> TranscriptionJob | None:
        result = await self._session.execute(
            select(TranscriptionJob).where(TranscriptionJob.id == job_id)
        )
        return result.scalar_one_or_none()

    async def get_by_video_id(self, video_id: uuid.UUID) -> TranscriptionJob | None:
        """Return the most recent job for a video (videos can have multiple jobs after re-transcribing)."""
        result = await self._session.execute(
            select(TranscriptionJob)
            .where(TranscriptionJob.video_id == video_id)
            .order_by(TranscriptionJob.created_at.desc())
            .limit(1)
        )
        return result.scalar_one_or_none()

    async def claim_queued(self) -> TranscriptionJob | None:
        """Atomically claim the oldest queued job by setting status to processing."""
        result = await self._session.execute(
            update(TranscriptionJob)
            .where(
                TranscriptionJob.id
                == select(TranscriptionJob.id)
                .where(TranscriptionJob.status == "queued")
                .order_by(TranscriptionJob.created_at)
                .limit(1)
                .scalar_subquery()
            )
            .values(
                status="processing",
                started_at=datetime.now(tz=timezone.utc),
            )
            .returning(TranscriptionJob)
        )
        row = result.fetchone()
        if row is None:
            return None
        await self._session.flush()
        # Look up by job ID, not video ID — a video may have multiple jobs
        return await self.get_by_id(row[0].id)

    async def update_progress(self, job_id: uuid.UUID, progress: int) -> None:
        await self._session.execute(
            update(TranscriptionJob)
            .where(TranscriptionJob.id == job_id)
            .values(progress=progress)
        )
        await self._session.flush()

    async def mark_completed(self, job_id: uuid.UUID) -> None:
        await self._session.execute(
            update(TranscriptionJob)
            .where(TranscriptionJob.id == job_id)
            .values(
                status="completed",
                progress=100,
                finished_at=datetime.now(tz=timezone.utc),
            )
        )
        await self._session.flush()

    async def mark_failed(self, job_id: uuid.UUID, error: str) -> None:
        await self._session.execute(
            update(TranscriptionJob)
            .where(TranscriptionJob.id == job_id)
            .values(
                status="failed",
                error_message=error,
                finished_at=datetime.now(tz=timezone.utc),
            )
        )
        await self._session.flush()

    async def queue_position(self, job_id: uuid.UUID) -> int | None:
        """Return how many queued jobs are ahead of this one (1 = next up). None if not queued."""
        job = await self.get_by_id(job_id)
        if job is None or job.status != "queued":
            return None
        result = await self._session.execute(
            select(func.count()).where(
                TranscriptionJob.status == "queued",
                TranscriptionJob.created_at <= job.created_at,
            )
        )
        return result.scalar_one()

    async def reset_orphaned(self) -> None:
        """On worker startup: set processing -> queued for jobs left in-flight."""
        await self._session.execute(
            update(TranscriptionJob)
            .where(TranscriptionJob.status == "processing")
            .values(status="queued", started_at=None)
        )
        await self._session.flush()
