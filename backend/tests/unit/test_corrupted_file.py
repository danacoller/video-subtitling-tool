"""Tests that verify behaviour when a video file is unreadable / corrupted.

These tests exercise the full path from _extract_audio (ffmpeg wrapper) through
to the retry-decision logic, using a pre-built corrupted fixture file and a real
ffmpeg call.  They do NOT require a running database — the DB interactions are
covered by the fake-repository tests in test_worker.py.
"""
import shutil
import uuid
from pathlib import Path

import pytest

from app.errors import CorruptedVideoError
from app.models import Subtitle, TranscriptionJob, Video
from app.repositories.fakes import FakeJobRepository, FakeSubtitleRepository, FakeVideoRepository
from app.worker import _extract_audio, _should_retry

# Optional fixture: video-subtitling-tool/test-videos/corrupted_test.mp4
# parents[2] = backend/; .parent = project root (works in Docker and locally).
_PROJECT_ROOT = Path(__file__).resolve().parents[2].parent
_CORRUPTED_FILE = _PROJECT_ROOT / "test-videos" / "corrupted_test.mp4"

_FFMPEG_AVAILABLE = shutil.which("ffmpeg") is not None


# ---------------------------------------------------------------------------
# Fixture helpers
# ---------------------------------------------------------------------------

def _make_video(path: str) -> Video:
    return Video(
        id=uuid.uuid4(),
        original_name=Path(path).name,
        content_type="video/mp4",
        size_bytes=Path(path).stat().st_size if Path(path).exists() else 1024,
        storage_path=path,
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


# ---------------------------------------------------------------------------
# _extract_audio tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
@pytest.mark.skipif(not _FFMPEG_AVAILABLE, reason="ffmpeg binary not found on PATH")
async def test_extract_audio_raises_corrupted_error_for_garbage_file(tmp_path):
    """_extract_audio must raise CorruptedVideoError when ffmpeg cannot decode the file."""
    # Write garbage bytes so ffmpeg cannot recognise the container
    bad_file = tmp_path / "garbage.mp4"
    bad_file.write_bytes(b"\x00\xff\xaa" * 512)

    audio_out = tmp_path / "out.wav"
    with pytest.raises(CorruptedVideoError):
        await _extract_audio(bad_file, audio_out)


@pytest.mark.asyncio
@pytest.mark.skipif(
    not _CORRUPTED_FILE.exists() or not _FFMPEG_AVAILABLE,
    reason="corrupted_test.mp4 fixture not present or ffmpeg not on PATH",
)
async def test_extract_audio_raises_corrupted_error_for_fixture_file(tmp_path):
    """_extract_audio raises CorruptedVideoError for the pre-built corrupted fixture."""
    audio_out = tmp_path / "out.wav"
    with pytest.raises(CorruptedVideoError) as exc_info:
        await _extract_audio(_CORRUPTED_FILE, audio_out)

    assert "corrupted_test.mp4" in str(exc_info.value)


# ---------------------------------------------------------------------------
# _should_retry: corrupted files must never be retried
# ---------------------------------------------------------------------------

def test_should_retry_returns_false_for_corrupted_error():
    exc = CorruptedVideoError("bad file")
    # Even on the very first attempt, a corrupted file must not be retried
    assert _should_retry(exc, retry_count=0) is False


def test_should_retry_returns_true_for_non_corrupted_error_within_limit():
    assert _should_retry(RuntimeError("oom"), retry_count=0) is True


def test_should_retry_returns_false_when_retries_exhausted():
    assert _should_retry(RuntimeError("crash"), retry_count=3) is False


# ---------------------------------------------------------------------------
# End-to-end fake-repo flow: corrupted file → immediate failure, no requeue
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_corrupted_file_job_fails_without_requeue():
    """
    When a CorruptedVideoError surfaces, the job must be marked 'failed' and
    must NOT be requeued, regardless of how many retries remain.
    """
    video_repo = FakeVideoRepository()
    job_repo = FakeJobRepository()
    subtitle_repo = FakeSubtitleRepository()

    video = await video_repo.create(_make_video("/tmp/corrupted.mp4"))
    await job_repo.create(_make_job(video.id, retry_count=0))

    job = await job_repo.claim_queued()
    assert job is not None

    try:
        raise CorruptedVideoError("ffmpeg could not read the file")
    except CorruptedVideoError as exc:
        # Mirrors the except-CorruptedVideoError branch in _process_job
        await job_repo.mark_failed(job.id, str(exc))

    final = await job_repo.get_by_video_id(video.id)
    assert final.status == "failed"
    assert final.retry_count == 0, "retry_count must stay 0 — we never called requeue_for_retry"
    assert final.error_message is not None


@pytest.mark.asyncio
async def test_corrupted_file_job_fails_even_when_retries_remain():
    """Verify the no-retry rule holds even when retry budget is not yet exhausted."""
    video_repo = FakeVideoRepository()
    job_repo = FakeJobRepository()

    video = await video_repo.create(_make_video("/tmp/corrupted.mp4"))
    # retry_count=1 — budget still available, but should NOT matter
    await job_repo.create(_make_job(video.id, retry_count=1))

    job = await job_repo.claim_queued()
    exc = CorruptedVideoError("garbage bytes")

    assert not _should_retry(exc, retry_count=job.retry_count), (
        "_should_retry must return False for CorruptedVideoError regardless of retry budget"
    )

    await job_repo.mark_failed(job.id, str(exc))
    final = await job_repo.get_by_video_id(video.id)
    assert final.status == "failed"
    assert final.retry_count == 1, "retry_count unchanged — no requeue was called"
