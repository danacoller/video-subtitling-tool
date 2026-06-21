import uuid

import pytest

from app.models import Subtitle, TranscriptionJob, Video
from app.repositories.fakes import FakeJobRepository, FakeSubtitleRepository, FakeVideoRepository


def _make_video() -> Video:
    return Video(
        id=uuid.uuid4(),
        original_name="test.mp4",
        content_type="video/mp4",
        size_bytes=1024,
        storage_path=f"/tmp/{uuid.uuid4()}.mp4",
        status="uploaded",
    )


@pytest.mark.asyncio
async def test_video_repo_get_nonexistent():
    repo = FakeVideoRepository()
    result = await repo.get_by_id(uuid.uuid4())
    assert result is None


@pytest.mark.asyncio
async def test_video_repo_create_and_get():
    repo = FakeVideoRepository()
    video = await repo.create(_make_video())
    fetched = await repo.get_by_id(video.id)
    assert fetched is not None
    assert fetched.id == video.id


@pytest.mark.asyncio
async def test_job_repo_claim_queued_when_none():
    repo = FakeJobRepository()
    result = await repo.claim_queued()
    assert result is None


@pytest.mark.asyncio
async def test_job_repo_claim_queued():
    video_id = uuid.uuid4()
    repo = FakeJobRepository()
    job = TranscriptionJob(id=uuid.uuid4(), video_id=video_id, status="queued", progress=0)
    await repo.create(job)
    claimed = await repo.claim_queued()
    assert claimed is not None
    assert claimed.status == "processing"


@pytest.mark.asyncio
async def test_job_repo_reset_orphaned():
    video_id = uuid.uuid4()
    repo = FakeJobRepository()
    job = TranscriptionJob(id=uuid.uuid4(), video_id=video_id, status="processing", progress=50)
    await repo.create(job)
    await repo.reset_orphaned()
    j = await repo.get_by_video_id(video_id)
    assert j is not None
    assert j.status == "queued"


@pytest.mark.asyncio
async def test_subtitle_repo_bulk_replace_empties_then_refills():
    video_id = uuid.uuid4()
    repo = FakeSubtitleRepository()
    sub = Subtitle(
        id=uuid.uuid4(), video_id=video_id, start_ms=0, end_ms=1000, text="Old", position=1
    )
    await repo.create(sub)

    new_subs = [
        Subtitle(id=uuid.uuid4(), video_id=video_id, start_ms=0, end_ms=500, text="New A", position=1),
        Subtitle(id=uuid.uuid4(), video_id=video_id, start_ms=500, end_ms=1500, text="New B", position=2),
    ]
    result = await repo.bulk_replace(video_id, new_subs)
    assert len(result) == 2
    listed = await repo.list_by_video(video_id)
    assert len(listed) == 2
    assert listed[0].text == "New A"
