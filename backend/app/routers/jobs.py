import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.repositories.job_repo import JobRepository
from app.repositories.video_repo import VideoRepository
from app.schemas.job_schemas import JobResponse, JobWithVideoResponse
from app.services.job_service import JobService
from app.services.transcription_service import TranscriptionService

router = APIRouter(tags=["jobs"])


def _get_job_service(session: AsyncSession = Depends(get_db)) -> JobService:
    return JobService(job_repo=JobRepository(session))


def _get_transcription_service(
    session: AsyncSession = Depends(get_db),
) -> TranscriptionService:
    return TranscriptionService(
        job_repo=JobRepository(session),
        video_repo=VideoRepository(session),
    )


@router.get("/jobs", response_model=list[JobWithVideoResponse])
async def list_all_jobs(
    service: JobService = Depends(_get_job_service),
) -> list[JobWithVideoResponse]:
    return await service.list_all()


@router.post(
    "/videos/{video_id}/transcribe", response_model=JobResponse, status_code=202
)
async def transcribe_video(
    video_id: uuid.UUID,
    service: TranscriptionService = Depends(_get_transcription_service),
    session: AsyncSession = Depends(get_db),
) -> JobResponse:
    job = await service.enqueue(video_id)
    await session.commit()
    return JobResponse.model_validate(job)


@router.get("/videos/{video_id}/job", response_model=JobResponse)
async def get_job(
    video_id: uuid.UUID,
    transcription_service: TranscriptionService = Depends(_get_transcription_service),
    job_service: JobService = Depends(_get_job_service),
    session: AsyncSession = Depends(get_db),
) -> JobResponse:
    job = await transcription_service.get_job(video_id)
    response = JobResponse.model_validate(job)
    if job.status == "queued":
        response = await job_service.enrich_with_queue_info(response, job.id)
    return response
