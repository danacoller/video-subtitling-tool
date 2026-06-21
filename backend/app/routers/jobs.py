import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.repositories.job_repo import JobRepository
from app.repositories.video_repo import VideoRepository
from app.schemas.job_schemas import JobResponse, JobWithVideoResponse
from app.services.transcription_service import TranscriptionService

router = APIRouter(tags=["jobs"])


@router.get("/jobs", response_model=list[JobWithVideoResponse])
async def list_all_jobs(
    session: AsyncSession = Depends(get_db),
) -> list[JobWithVideoResponse]:
    rows = await JobRepository(session).list_all_with_video()
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


def _get_service(session: AsyncSession = Depends(get_db)) -> TranscriptionService:
    return TranscriptionService(
        job_repo=JobRepository(session),
        video_repo=VideoRepository(session),
    )


@router.post(
    "/videos/{video_id}/transcribe", response_model=JobResponse, status_code=202
)
async def transcribe_video(
    video_id: uuid.UUID,
    service: TranscriptionService = Depends(_get_service),
    session: AsyncSession = Depends(get_db),
) -> JobResponse:
    job = await service.enqueue(video_id)
    await session.commit()
    return JobResponse.model_validate(job)


@router.get("/videos/{video_id}/job", response_model=JobResponse)
async def get_job(
    video_id: uuid.UUID,
    service: TranscriptionService = Depends(_get_service),
    session: AsyncSession = Depends(get_db),
) -> JobResponse:
    job = await service.get_job(video_id)
    response = JobResponse.model_validate(job)
    if job.status == "queued":
        repo = JobRepository(session)
        response.queue_position = await repo.queue_position(job.id)
        response.active_job_progress = await repo.active_job_progress()
    return response
