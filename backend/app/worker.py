"""Background worker: polls for queued transcription jobs and processes them."""
import asyncio
import logging
import signal
import tempfile
from pathlib import Path

import ffmpeg

from app.adapters.transcription import FasterWhisperTranscriber, Transcriber
from app.config import settings
from app.db import AsyncSessionLocal
from app.models import Subtitle
from app.repositories.job_repo import JobRepository
from app.repositories.subtitle_repo import SubtitleRepository
from app.repositories.video_repo import VideoRepository

logger = logging.getLogger(__name__)
_shutdown = False


def _handle_sigterm(signum, frame):
    global _shutdown
    logger.info("SIGTERM received — shutting down worker")
    _shutdown = True


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

        async with AsyncSessionLocal() as session:
            job_repo = JobRepository(session)
            video_repo = VideoRepository(session)
            subtitle_repo = SubtitleRepository(session)

            try:
                video = await video_repo.get_by_id(job.video_id)
                if video is None:
                    await job_repo.mark_failed(job.id, "Video not found")
                    await session.commit()
                    continue

                video_path = Path(video.storage_path)

                with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                    audio_path = Path(tmp.name)

                try:
                    (
                        ffmpeg.input(str(video_path))
                        .output(
                            str(audio_path),
                            acodec="pcm_s16le",
                            ac=1,
                            ar="16000",
                        )
                        .overwrite_output()
                        .run(quiet=True)
                    )

                    segments = transcriber.transcribe(audio_path)
                finally:
                    audio_path.unlink(missing_ok=True)

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
                await session.commit()
                logger.info("Job %s completed with %d segments", job.id, len(segments))

            except Exception as exc:
                logger.exception("Job %s failed: %s", job.id, exc)
                await job_repo.mark_failed(job.id, str(exc))
                await session.commit()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
