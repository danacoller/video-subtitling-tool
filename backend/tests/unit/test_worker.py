"""Worker unit tests using FakeTranscriber and fake repos — no DB, no ffmpeg."""
import uuid
from pathlib import Path

import pytest

from app.adapters.transcription import FakeTranscriber, TranscriptSegment
from app.models import Subtitle, TranscriptionJob, Video
from app.repositories.fakes import FakeJobRepository, FakeSubtitleRepository, FakeVideoRepository


def _make_video(storage_path: str = "/tmp/test.mp4") -> Video:
    return Video(
        id=uuid.uuid4(),
        original_name="test.mp4",
        content_type="video/mp4",
        size_bytes=1024,
        storage_path=storage_path,
        status="uploaded",
    )


async def _run_one_job(video_repo, job_repo, subtitle_repo, transcriber, video_path="/tmp/test.mp4"):
    """Extract the core worker job logic so we can test it without the poll loop."""
    job = await job_repo.claim_queued()
    if job is None:
        return None

    try:
        video = await video_repo.get_by_id(job.video_id)
        if video is None:
            await job_repo.mark_failed(job.id, "Video not found")
            return job

        segments = transcriber.transcribe(Path(video_path))
        subtitles = [
            Subtitle(
                video_id=job.video_id,
                start_ms=round(seg.start_sec * 1000),
                end_ms=max(round(seg.end_sec * 1000), round(seg.start_sec * 1000) + 1),
                text=seg.text,
                position=i,
            )
            for i, seg in enumerate(segments, start=1)
        ]
        await subtitle_repo.bulk_replace(job.video_id, subtitles)
        await job_repo.mark_completed(job.id)
    except Exception as exc:
        await job_repo.mark_failed(job.id, str(exc))

    return job


@pytest.mark.asyncio
async def test_processes_queued_job_and_marks_completed():
    video_repo = FakeVideoRepository()
    job_repo = FakeJobRepository()
    subtitle_repo = FakeSubtitleRepository()

    video = await video_repo.create(_make_video())
    job = TranscriptionJob(id=uuid.uuid4(), video_id=video.id, status="queued", progress=0)
    await job_repo.create(job)

    await _run_one_job(video_repo, job_repo, subtitle_repo, FakeTranscriber())

    updated_job = await job_repo.get_by_video_id(video.id)
    assert updated_job.status == "completed"
    cues = await subtitle_repo.list_by_video(video.id)
    assert len(cues) == 3  # FakeTranscriber returns 3 segments


@pytest.mark.asyncio
async def test_marks_failed_when_transcriber_raises():
    video_repo = FakeVideoRepository()
    job_repo = FakeJobRepository()
    subtitle_repo = FakeSubtitleRepository()

    video = await video_repo.create(_make_video())
    job = TranscriptionJob(id=uuid.uuid4(), video_id=video.id, status="queued", progress=0)
    await job_repo.create(job)

    class BrokenTranscriber:
        def transcribe(self, path):
            raise RuntimeError("model crashed")

    await _run_one_job(video_repo, job_repo, subtitle_repo, BrokenTranscriber())

    updated_job = await job_repo.get_by_video_id(video.id)
    assert updated_job.status == "failed"
    assert "model crashed" in updated_job.error_message


@pytest.mark.asyncio
async def test_resets_orphaned_jobs_on_startup():
    job_repo = FakeJobRepository()
    video_id = uuid.uuid4()
    job = TranscriptionJob(id=uuid.uuid4(), video_id=video_id, status="processing", progress=50)
    await job_repo.create(job)

    await job_repo.reset_orphaned()

    reset_job = await job_repo.get_by_video_id(video_id)
    assert reset_job.status == "queued"
    assert reset_job.started_at is None


@pytest.mark.asyncio
async def test_empty_transcript_yields_zero_cues():
    video_repo = FakeVideoRepository()
    job_repo = FakeJobRepository()
    subtitle_repo = FakeSubtitleRepository()

    video = await video_repo.create(_make_video())
    job = TranscriptionJob(id=uuid.uuid4(), video_id=video.id, status="queued", progress=0)
    await job_repo.create(job)

    class EmptyTranscriber:
        def transcribe(self, path):
            return []

    await _run_one_job(video_repo, job_repo, subtitle_repo, EmptyTranscriber())

    updated_job = await job_repo.get_by_video_id(video.id)
    assert updated_job.status == "completed"
    cues = await subtitle_repo.list_by_video(video.id)
    assert len(cues) == 0


@pytest.mark.asyncio
async def test_no_job_when_queue_empty():
    job_repo = FakeJobRepository()
    result = await job_repo.claim_queued()
    assert result is None
