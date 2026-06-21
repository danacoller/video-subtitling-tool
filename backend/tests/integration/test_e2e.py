"""
End-to-end integration test using an in-memory SQLite-compatible setup
with fake repositories, so no real DB or storage is needed.

Flow: upload -> transcribe -> simulate worker -> edit -> export VTT
"""
import io
import uuid
from unittest.mock import MagicMock, patch

import pytest

from app.adapters.transcription import FakeTranscriber, TranscriptSegment
from app.errors import (
    DuplicateJobError,
    InvalidCueError,
    VideoNotFoundError,
)
from app.models import Subtitle, TranscriptionJob, Video
from app.repositories.fakes import FakeJobRepository, FakeSubtitleRepository, FakeVideoRepository
from app.schemas.subtitle_schemas import CueCreate, CuePatch
from app.services.subtitle_service import SubtitleService
from app.services.transcription_service import TranscriptionService


def _make_fake_video_repo_with_video():
    video_repo = FakeVideoRepository()
    return video_repo


@pytest.fixture()
def repos():
    video_repo = FakeVideoRepository()
    job_repo = FakeJobRepository()
    subtitle_repo = FakeSubtitleRepository()
    return video_repo, job_repo, subtitle_repo


@pytest.fixture()
def services(repos):
    video_repo, job_repo, subtitle_repo = repos
    transcription_svc = TranscriptionService(job_repo=job_repo, video_repo=video_repo)
    subtitle_svc = SubtitleService(subtitle_repo=subtitle_repo, video_repo=video_repo)
    return transcription_svc, subtitle_svc, video_repo, job_repo, subtitle_repo


@pytest.mark.asyncio
async def test_full_flow(services):
    transcription_svc, subtitle_svc, video_repo, job_repo, subtitle_repo = services

    # a. Create a video record
    video = Video(
        id=uuid.uuid4(),
        original_name="sample.mp4",
        content_type="video/mp4",
        size_bytes=1024,
        storage_path="/tmp/sample.mp4",
        status="uploaded",
    )
    video = await video_repo.create(video)

    # b. Enqueue transcription
    job = await transcription_svc.enqueue(video.id)
    assert job.status == "queued"

    # c. Simulate worker: claim job and run FakeTranscriber
    claimed = await job_repo.claim_queued()
    assert claimed is not None

    transcriber = FakeTranscriber()
    segments = transcriber.transcribe(None)  # type: ignore[arg-type]
    subtitles = [
        Subtitle(
            video_id=video.id,
            start_ms=round(seg.start_sec * 1000),
            end_ms=round(seg.end_sec * 1000),
            text=seg.text,
            position=i,
        )
        for i, seg in enumerate(segments, start=1)
    ]
    await subtitle_repo.bulk_replace(video.id, subtitles)
    await job_repo.mark_completed(claimed.id)

    # d. Assert cues populated
    cues = await subtitle_svc.list_cues(video.id)
    assert len(cues) == 3

    # e. PATCH one cue
    first = cues[0]
    updated = await subtitle_svc.update_cue(first.id, CuePatch(text="Updated text"))
    assert updated.text == "Updated text"

    # f. Bulk reorder
    new_order = [
        CueCreate(start_ms=c.start_ms, end_ms=c.end_ms, text=c.text) for c in reversed(cues)
    ]
    replaced = await subtitle_svc.bulk_replace(video.id, new_order)
    assert len(replaced) == 3

    # g. Export VTT
    vtt = await subtitle_svc.export_vtt(video.id)
    assert vtt.startswith("WEBVTT")
    assert "-->" in vtt


@pytest.mark.asyncio
async def test_transcribe_twice_raises_duplicate(services):
    transcription_svc, _, video_repo, _, _ = services
    video = Video(
        id=uuid.uuid4(),
        original_name="v.mp4",
        content_type="video/mp4",
        size_bytes=100,
        storage_path="/tmp/v.mp4",
        status="uploaded",
    )
    video = await video_repo.create(video)
    await transcription_svc.enqueue(video.id)
    with pytest.raises(DuplicateJobError):
        await transcription_svc.enqueue(video.id)


@pytest.mark.asyncio
async def test_export_empty_subtitles_valid_vtt(services):
    _, subtitle_svc, video_repo, _, _ = services
    video = Video(
        id=uuid.uuid4(),
        original_name="empty.mp4",
        content_type="video/mp4",
        size_bytes=100,
        storage_path="/tmp/empty.mp4",
        status="uploaded",
    )
    video = await video_repo.create(video)
    vtt = await subtitle_svc.export_vtt(video.id)
    assert vtt.strip() == "WEBVTT"


@pytest.mark.asyncio
async def test_patch_invalid_timing_raises(services):
    _, subtitle_svc, video_repo, _, _ = services
    video = Video(
        id=uuid.uuid4(),
        original_name="t.mp4",
        content_type="video/mp4",
        size_bytes=100,
        storage_path="/tmp/t.mp4",
        status="uploaded",
    )
    video = await video_repo.create(video)
    cue = await subtitle_svc.add_cue(video.id, start_ms=1000, end_ms=2000, text="Hi")
    with pytest.raises(InvalidCueError):
        await subtitle_svc.update_cue(cue.id, CuePatch(end_ms=500))


@pytest.mark.asyncio
async def test_get_nonexistent_video_raises(services):
    _, subtitle_svc, _, _, _ = services
    with pytest.raises(VideoNotFoundError):
        await subtitle_svc.export_vtt(uuid.uuid4())
