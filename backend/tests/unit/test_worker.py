"""Worker unit tests using FakeTranscriber and fake repos — no DB, no ffmpeg."""
import uuid
from pathlib import Path

import pytest

from app.adapters.transcription import FakeTranscriber, TranscriptSegment
from app.errors import CorruptedVideoError
from app.models import Subtitle, TranscriptionJob, Video
from app.repositories.fakes import FakeJobRepository, FakeSubtitleRepository, FakeVideoRepository
from app.worker import _should_retry


def _make_video(storage_path: str = "/tmp/test.mp4") -> Video:
    return Video(
        id=uuid.uuid4(),
        original_name="test.mp4",
        content_type="video/mp4",
        size_bytes=1024,
        storage_path=storage_path,
        status="uploaded",
    )


def _make_job(video_id: uuid.UUID, retry_count: int = 0) -> TranscriptionJob:
    return TranscriptionJob(
        id=uuid.uuid4(),
        video_id=video_id,
        status="queued",
        progress=0,
        retry_count=retry_count,
    )


async def _run_one_job(video_repo, job_repo, subtitle_repo, transcriber, video_path="/tmp/test.mp4"):
    """Run a single job without retry logic (used by basic happy-path tests)."""
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


async def _run_job_with_retry(
    video_repo,
    job_repo,
    subtitle_repo,
    transcriber,
    max_retries: int = 3,
) -> TranscriptionJob | None:
    """Run a single job with the same retry semantics as the real worker."""
    job = await job_repo.claim_queued()
    if job is None:
        return None

    try:
        video = await video_repo.get_by_id(job.video_id)
        if video is None:
            await job_repo.mark_failed(job.id, "Video not found")
            return job

        segments = list(transcriber.transcribe(Path(video.storage_path)))
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

    except CorruptedVideoError as exc:
        await job_repo.mark_failed(job.id, str(exc))

    except Exception as exc:
        retry_count = getattr(job, "retry_count", 0) or 0
        if retry_count < max_retries:
            await job_repo.requeue_for_retry(job.id)
        else:
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


# ---------------------------------------------------------------------------
# _should_retry unit tests
# ---------------------------------------------------------------------------

def test_should_retry_transient_error_within_limit():
    assert _should_retry(RuntimeError("oom"), retry_count=0) is True
    assert _should_retry(RuntimeError("oom"), retry_count=2) is True


def test_should_not_retry_when_limit_reached():
    assert _should_retry(RuntimeError("oom"), retry_count=3) is False


def test_should_not_retry_corrupted_video():
    assert _should_retry(CorruptedVideoError("bad file"), retry_count=0) is False
    assert _should_retry(CorruptedVideoError("bad file"), retry_count=1) is False


# ---------------------------------------------------------------------------
# Retry flow tests (using _run_job_with_retry)
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_job_requeued_on_transient_failure():
    """A transient error on the first attempt requeues the job with retry_count=1."""
    video_repo = FakeVideoRepository()
    job_repo = FakeJobRepository()
    subtitle_repo = FakeSubtitleRepository()

    video = await video_repo.create(_make_video())
    await job_repo.create(_make_job(video.id, retry_count=0))

    class FailingTranscriber:
        def transcribe(self, path):
            raise RuntimeError("transient model crash")

    await _run_job_with_retry(
        video_repo, job_repo, subtitle_repo, FailingTranscriber(), max_retries=3
    )

    job = await job_repo.get_by_video_id(video.id)
    assert job.status == "queued", "Job should be requeued for retry"
    assert job.retry_count == 1, "retry_count should be incremented"
    assert job.progress == 0


@pytest.mark.asyncio
async def test_job_marked_failed_after_max_retries():
    """A job that has already reached MAX_RETRIES is permanently failed."""
    video_repo = FakeVideoRepository()
    job_repo = FakeJobRepository()
    subtitle_repo = FakeSubtitleRepository()

    video = await video_repo.create(_make_video())
    # Simulate a job that has already been retried MAX_RETRIES (3) times
    await job_repo.create(_make_job(video.id, retry_count=3))

    class AlwaysFailingTranscriber:
        def transcribe(self, path):
            raise RuntimeError("persistent crash")

    await _run_job_with_retry(
        video_repo, job_repo, subtitle_repo, AlwaysFailingTranscriber(), max_retries=3
    )

    job = await job_repo.get_by_video_id(video.id)
    assert job.status == "failed", "Job should be permanently failed"
    assert job.retry_count == 3, "retry_count should not change after permanent failure"


@pytest.mark.asyncio
async def test_corrupted_file_fails_immediately_no_retry():
    """CorruptedVideoError marks the job failed immediately — no requeue."""
    video_repo = FakeVideoRepository()
    job_repo = FakeJobRepository()
    subtitle_repo = FakeSubtitleRepository()

    video = await video_repo.create(_make_video())
    await job_repo.create(_make_job(video.id, retry_count=0))

    class CorruptedTranscriber:
        def transcribe(self, path):
            raise CorruptedVideoError("ffmpeg could not read the file")

    await _run_job_with_retry(
        video_repo, job_repo, subtitle_repo, CorruptedTranscriber(), max_retries=3
    )

    job = await job_repo.get_by_video_id(video.id)
    assert job.status == "failed", "Corrupted file should fail immediately"
    assert job.retry_count == 0, "retry_count must not be incremented for corrupted files"
    assert job.error_message is not None and "ffmpeg" in job.error_message
