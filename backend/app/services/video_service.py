import uuid
from pathlib import Path
from typing import BinaryIO

from app.adapters.media_probe import probe_video_duration
from app.adapters.storage import StorageAdapter
from app.config import settings
from app.errors import VideoNotFoundError, VideoUploadError
from app.models import Video
from app.repositories.video_repo import VideoRepositoryProtocol


class VideoService:
    def __init__(
        self,
        repo: VideoRepositoryProtocol,
        storage: StorageAdapter,
    ) -> None:
        self._repo = repo
        self._storage = storage

    @property
    def storage(self) -> StorageAdapter:
        return self._storage

    async def upload(
        self,
        filename: str,
        content_type: str,
        stream: BinaryIO,
    ) -> Video:
        if content_type not in settings.ALLOWED_CONTENT_TYPES:
            raise VideoUploadError(
                f"Content type '{content_type}' is not allowed. "
                f"Allowed: {sorted(settings.ALLOWED_CONTENT_TYPES)}"
            )

        # Save to storage (streaming — never fully buffered in memory)
        storage_path = self._storage.save_stream(stream, filename)
        size_bytes = self._storage.file_size(storage_path)

        if size_bytes > settings.MAX_UPLOAD_BYTES:
            self._storage.delete(storage_path)
            raise VideoUploadError(
                f"File size {size_bytes} exceeds maximum {settings.MAX_UPLOAD_BYTES}"
            )

        video = Video(
            original_name=filename,
            content_type=content_type,
            size_bytes=size_bytes,
            duration_seconds=probe_video_duration(str(storage_path)),
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

    async def delete(self, video_id: uuid.UUID) -> None:
        video = await self._repo.get_by_id(video_id)
        if video is None:
            raise VideoNotFoundError(f"Video {video_id} not found")
        self._storage.delete(Path(video.storage_path))
        await self._repo.delete(video_id)

    async def delete_all(self) -> None:
        videos = await self._repo.delete_all()
        for video in videos:
            self._storage.delete(Path(video.storage_path))
