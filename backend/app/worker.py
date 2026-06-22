"""Background worker: polls for queued transcription jobs and processes them."""
import asyncio
import logging
import signal
import tempfile
import time
import types
from pathlib import Path

import ffmpeg

from app.adapters.media_probe import probe_video_duration
from app.adapters.transcription import FasterWhisperTranscriber, Transcriber
from app.config import settings
from app.db import AsyncSessionLocal
from app.errors import CorruptedVideoError
from app.models import Subtitle, TranscriptionJob
from app.repositories.job_repo import JobRepository
from app.repositories.subtitle_repo import SubtitleRepository
from app.repositories.video_repo import VideoRepository

logger = logging.getLogger(__name__)

_AUDIO_SAMPLE_RATE = "16000"
_AUDIO_CHANNELS = 1
_PROGRESS_WRITE_INTERVAL_SEC = 1.0
_PROGRESS_CAP = 99

_shutdown = False


def _handle_sigterm(signum: int, frame: types.FrameType | None) -> None:
    global _shutdown
    logger.info("SIGTERM received — shutting down worker")
    _shutdown = True


def _should_retry(exc: Exception, retry_count: int) -> bool:
    """Return True if the job should be requeued for another attempt.

    Corrupted-file errors are deterministic — retrying will always fail, so we
    mark them failed immediately.  Everything else (OOM, model crash, network
    hiccup) may succeed on a subsequent attempt up to MAX_JOB_RETRIES.
    """
    if isinstance(exc, CorruptedVideoError):
        return False
    return retry_count < settings.MAX_JOB_RETRIES


async def _extract_audio(video_path: Path, audio_path: Path) -> None:
    try:
        (
            ffmpeg.input(str(video_path))
            .output(
                str(audio_path),
                acodec="pcm_s16le",
                ac=_AUDIO_CHANNELS,
                ar=_AUDIO_SAMPLE_RATE,
            )
            .overwrite_output()
            .run(quiet=True)
        )
    except ffmpeg.Error as exc:
        raise CorruptedVideoError(
            f"Cannot decode '{video_path.name}': ffmpeg could not read the file"
        ) from exc


async def _process_job(
    job: TranscriptionJob,
    transcriber: Transcriber,
) -> None:
    async with AsyncSessionLocal() as session:
        job_repo = JobRepository(session)
        video_repo = VideoRepository(session)
        subtitle_repo = SubtitleRepository(session)

        try:
            video = await video_repo.get_by_id(job.video_id)
            if video is None:
                await job_repo.mark_failed(job.id, "Video not found")
                await session.commit()
                return

            video_path = Path(video.storage_path)

            if video.duration_seconds is None:
                video.duration_seconds = probe_video_duration(str(video_path))
                await session.commit()

            duration_sec: float = video.duration_seconds or 0.0

            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                audio_path = Path(tmp.name)

            try:
                await _extract_audio(video_path, audio_path)
                subtitles, cancelled = await _transcribe_segments(
                    job, transcriber, audio_path, duration_sec, job_repo
                )
            finally:
                audio_path.unlink(missing_ok=True)

            if cancelled:
                return

            await subtitle_repo.bulk_replace(job.video_id, subtitles)
            await job_repo.mark_completed(job.id)
            await session.commit()
            logger.info("Job %s completed with %d segments", job.id, len(subtitles))

        except CorruptedVideoError as exc:
            logger.warning("Job %s failed — corrupted file, no retry: %s", job.id, exc)
            await job_repo.mark_failed(job.id, str(exc))
            await session.commit()

        except Exception as exc:
            retry_count = getattr(job, "retry_count", 0) or 0
            if _should_retry(exc, retry_count):
                logger.warning(
                    "Job %s failed (attempt %d/%d), requeueing: %s",
                    job.id, retry_count + 1, settings.MAX_JOB_RETRIES, exc,
                )
                await job_repo.requeue_for_retry(job.id)
            else:
                logger.exception(
                    "Job %s failed permanently after %d attempt(s): %s",
                    job.id, retry_count + 1, exc,
                )
                await job_repo.mark_failed(
                    job.id,
                    f"Failed after {retry_count + 1} attempt(s): {exc}",
                )
            await session.commit()


async def _transcribe_segments(
    job: TranscriptionJob,
    transcriber: Transcriber,
    audio_path: Path,
    duration_sec: float,
    job_repo: JobRepository,
) -> tuple[list[Subtitle], bool]:
    # Write immediately so the bar moves off 0% before the first segment arrives.
    # faster-whisper blocks for several seconds doing VAD + model warm-up before
    # yielding anything — without this the UI shows 0% for the entire warm-up period.
    async with AsyncSessionLocal() as s:
        await JobRepository(s).update_progress(job.id, 1)
        await s.commit()

    subtitles: list[Subtitle] = []
    last_write_time = time.monotonic()
    transcription_start = time.monotonic()

    for i, seg in enumerate(transcriber.transcribe(audio_path), start=1):
        subtitles.append(
            Subtitle(
                video_id=job.video_id,
                start_ms=round(seg.start_sec * 1000),
                end_ms=max(
                    round(seg.end_sec * 1000),
                    round(seg.start_sec * 1000) + 1,
                ),
                text=seg.text,
                position=i,
            )
        )

        segment_pct = (
            int(seg.end_sec / duration_sec * 100) if duration_sec > 0 else 0
        )
        # Time-elapsed floor: if the model is buffering between segments,
        # advance progress based on wall time (assuming at-most 1× real-time speed).
        elapsed_sec = time.monotonic() - transcription_start
        time_floor_pct = (
            int(elapsed_sec / duration_sec * 100) if duration_sec > 0 else 0
        )
        pct = min(_PROGRESS_CAP, max(segment_pct, time_floor_pct))

        now = time.monotonic()
        if now - last_write_time >= _PROGRESS_WRITE_INTERVAL_SEC:
            last_write_time = now
            async with AsyncSessionLocal() as progress_session:
                still_exists = await JobRepository(progress_session).update_progress(
                    job.id, pct
                )
                await progress_session.commit()
            if not still_exists:
                logger.info("Job %s was deleted — aborting transcription", job.id)
                return subtitles, True
            logger.info("Job %s progress %d%%", job.id, pct)

    return subtitles, False


async def run_worker(transcriber: Transcriber | None = None) -> None:
    if transcriber is None:
        transcriber = FasterWhisperTranscriber(model_size=settings.WHISPER_MODEL)

    signal.signal(signal.SIGTERM, _handle_sigterm)

    async with AsyncSessionLocal() as session:
        job_repo = JobRepository(session)
        await job_repo.reset_orphaned()
        await session.commit()
        logger.info("Worker started — orphaned jobs reset")

    while not _shutdown:
        async with AsyncSessionLocal() as session:
            job = await JobRepository(session).claim_queued()
            if job is None:
                await asyncio.sleep(settings.WORKER_POLL_INTERVAL)
                continue
            await session.commit()
            logger.info("Processing job %s for video %s", job.id, job.video_id)

        await _process_job(job, transcriber)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
