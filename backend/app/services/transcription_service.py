import uuid

from app.errors import DuplicateJobError, JobNotFoundError, VideoNotFoundError
from app.models import TranscriptionJob
from app.repositories.job_repo import JobRepositoryProtocol
from app.repositories.video_repo import VideoRepositoryProtocol


class TranscriptionService:
    def __init__(
        self,
        job_repo: JobRepositoryProtocol,
        video_repo: VideoRepositoryProtocol,
    ) -> None:
        self._job_repo = job_repo
        self._video_repo = video_repo

    async def enqueue(self, video_id: uuid.UUID) -> TranscriptionJob:
        video = await self._video_repo.get_by_id(video_id)
        if video is None:
            raise VideoNotFoundError(f"Video {video_id} not found")

        existing = await self._job_repo.get_by_video_id(video_id)
        if existing is not None and existing.status in ("queued", "processing"):
            raise DuplicateJobError(
                f"A transcription job for video {video_id} is already {existing.status}"
            )

        job = TranscriptionJob(video_id=video_id, status="queued", progress=0)
        return await self._job_repo.create(job)

    async def get_job(self, video_id: uuid.UUID) -> TranscriptionJob:
        job = await self._job_repo.get_by_video_id(video_id)
        if job is None:
            raise JobNotFoundError(f"No transcription job for video {video_id}")
        return job
