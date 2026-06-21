import uuid

import pytest

from app.errors import DuplicateJobError, JobNotFoundError, VideoNotFoundError
from app.models import TranscriptionJob, Video
from app.repositories.fakes import FakeJobRepository, FakeVideoRepository
from app.services.transcription_service import TranscriptionService


def _make_video() -> Video:
    return Video(
        id=uuid.uuid4(),
        original_name="test.mp4",
        content_type="video/mp4",
        size_bytes=1024,
        storage_path=f"/tmp/{uuid.uuid4()}.mp4",
        status="uploaded",
    )


@pytest.fixture()
def svc():
    video_repo = FakeVideoRepository()
    job_repo = FakeJobRepository()
    return TranscriptionService(job_repo=job_repo, video_repo=video_repo), video_repo, job_repo


@pytest.mark.asyncio
async def test_enqueue_happy_path(svc):
    service, video_repo, _ = svc
    video = await video_repo.create(_make_video())
    job = await service.enqueue(video.id)
    assert job.status == "queued"
    assert job.video_id == video.id


@pytest.mark.asyncio
async def test_enqueue_nonexistent_video_raises(svc):
    service, _, _ = svc
    with pytest.raises(VideoNotFoundError):
        await service.enqueue(uuid.uuid4())


@pytest.mark.asyncio
async def test_enqueue_duplicate_raises(svc):
    service, video_repo, _ = svc
    video = await video_repo.create(_make_video())
    await service.enqueue(video.id)
    with pytest.raises(DuplicateJobError):
        await service.enqueue(video.id)


@pytest.mark.asyncio
async def test_get_job_nonexistent_raises(svc):
    service, video_repo, _ = svc
    video = await video_repo.create(_make_video())
    with pytest.raises(JobNotFoundError):
        await service.get_job(video.id)


@pytest.mark.asyncio
async def test_get_job_returns_latest(svc):
    service, video_repo, _ = svc
    video = await video_repo.create(_make_video())
    await service.enqueue(video.id)
    job = await service.get_job(video.id)
    assert job.status == "queued"
