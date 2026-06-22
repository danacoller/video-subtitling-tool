"""Service layer for job listing and status enrichment."""
import uuid

from app.repositories.job_repo import JobRepositoryProtocol
from app.schemas.job_schemas import JobResponse, JobWithVideoResponse


class JobService:
    def __init__(self, job_repo: JobRepositoryProtocol) -> None:
        self._job_repo = job_repo

    async def list_all(self) -> list[JobWithVideoResponse]:
        rows = await self._job_repo.list_all_with_video()
        return [
            JobWithVideoResponse(
                id=job.id,
                video_id=job.video_id,
                video_name=video_name,
                video_duration=video_duration,
                status=job.status,
                progress=job.progress,
                error_message=job.error_message,
                started_at=job.started_at,
                finished_at=job.finished_at,
                created_at=job.created_at,
            )
            for job, video_name, video_duration in rows
        ]

    async def enrich_with_queue_info(
        self, response: JobResponse, job_id: uuid.UUID
    ) -> JobResponse:
        """Attach queue position and active-job progress when a job is queued."""
        response.queue_position = await self._job_repo.queue_position(job_id)
        response.active_job_progress = await self._job_repo.active_job_progress()
        return response
