import io
import uuid

import pytest

from app.errors import InvalidCueError, VideoNotFoundError
from app.repositories.fakes import FakeVideoRepository
from app.services.video_service import VideoService


class FakeStorage:
    """In-memory storage adapter for unit tests."""

    def __init__(self, max_size: int = 10 * 1024 * 1024) -> None:
        self._files: dict[str, bytes] = {}
        self._max_size = max_size

    def save_stream(self, stream, filename: str):
        from pathlib import Path

        data = stream.read()
        key = f"/fake/{uuid.uuid4()}/{filename}"
        self._files[key] = data
        return Path(key)

    def open_for_read(self, path):
        from pathlib import Path

        return io.BytesIO(self._files.get(str(path), b""))

    def delete(self, path) -> None:
        self._files.pop(str(path), None)

    def file_size(self, path) -> int:
        return len(self._files.get(str(path), b""))


@pytest.fixture()
def service():
    return VideoService(repo=FakeVideoRepository(), storage=FakeStorage())


@pytest.mark.asyncio
async def test_upload_happy_path(service):
    stream = io.BytesIO(b"fake video data")
    video = await service.upload(
        filename="test.mp4",
        content_type="video/mp4",
        stream=stream,
    )
    assert video.original_name == "test.mp4"
    assert video.content_type == "video/mp4"
    assert video.size_bytes == len(b"fake video data")
    assert video.status == "uploaded"


@pytest.mark.asyncio
async def test_upload_unsupported_content_type_raises(service):
    with pytest.raises(InvalidCueError, match="not allowed"):
        await service.upload(
            filename="doc.pdf",
            content_type="application/pdf",
            stream=io.BytesIO(b"pdf data"),
        )


@pytest.mark.asyncio
async def test_upload_oversized_file_raises():
    storage = FakeStorage()
    from app.config import settings

    # Override max via a local service with patched settings
    svc = VideoService(repo=FakeVideoRepository(), storage=storage)
    big_data = b"x" * (settings.MAX_UPLOAD_BYTES + 1)

    # Patch the setting temporarily
    original = settings.MAX_UPLOAD_BYTES
    settings.MAX_UPLOAD_BYTES = 10  # 10 bytes max

    try:
        with pytest.raises(InvalidCueError, match="size"):
            await svc.upload("big.mp4", "video/mp4", io.BytesIO(big_data[:20]))
    finally:
        settings.MAX_UPLOAD_BYTES = original


@pytest.mark.asyncio
async def test_get_nonexistent_video_raises(service):
    with pytest.raises(VideoNotFoundError):
        await service.get(uuid.uuid4())


@pytest.mark.asyncio
async def test_get_uploaded_video(service):
    stream = io.BytesIO(b"data")
    video = await service.upload("clip.mp4", "video/mp4", stream)
    fetched = await service.get(video.id)
    assert fetched.id == video.id
