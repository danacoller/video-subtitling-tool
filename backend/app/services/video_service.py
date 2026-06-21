import json
import subprocess
import uuid
from typing import BinaryIO

from app.adapters.storage import StorageAdapter
from app.config import settings
from app.errors import InvalidCueError, VideoNotFoundError
from app.models import Video
from app.repositories.video_repo import VideoRepositoryProtocol


def _probe_duration(path: str) -> float | None:
    """Return duration in seconds via ffprobe, or None if it cannot be determined."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                path,
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        data = json.loads(result.stdout)
        raw = data.get("format", {}).get("duration")
        return float(raw) if raw is not None else None
    except Exception:
        return None


class VideoService:
    def __init__(
        self,
        repo: VideoRepositoryProtocol,
        storage: StorageAdapter,
    ) -> None:
        self._repo = repo
        self._storage = storage

    async def upload(
        self,
        filename: str,
        content_type: str,
        stream: BinaryIO,
    ) -> Video:
        if content_type not in settings.ALLOWED_CONTENT_TYPES:
            raise InvalidCueError(
                f"Content type '{content_type}' is not allowed. "
                f"Allowed: {sorted(settings.ALLOWED_CONTENT_TYPES)}"
            )

        # Save to storage (streaming — never fully buffered in memory)
        storage_path = self._storage.save_stream(stream, filename)
        size_bytes = self._storage.file_size(storage_path)

        if size_bytes > settings.MAX_UPLOAD_BYTES:
            self._storage.delete(storage_path)
            raise InvalidCueError(
                f"File size {size_bytes} exceeds maximum {settings.MAX_UPLOAD_BYTES}"
            )

        video = Video(
            original_name=filename,
            content_type=content_type,
            size_bytes=size_bytes,
            duration_seconds=_probe_duration(str(storage_path)),
            storage_path=str(storage_path),
            status="uploaded",
        )
        return await self._repo.create(video)

    async def get(self, video_id: uuid.UUID) -> Video:
        video = await self._repo.get_by_id(video_id)
        if video is None:
            raise VideoNotFoundError(f"Video {video_id} not found")
        return video

    async def list_all(self) -> list[Video]:
        return await self._repo.list_all()
