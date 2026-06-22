import re
import uuid
from collections.abc import Iterator
from pathlib import Path
from typing import BinaryIO, Protocol

from app.config import settings
from app.errors import StorageError

CHUNK_SIZE = 1024 * 1024  # 1 MB


class StorageAdapter(Protocol):
    def save_stream(self, stream: BinaryIO, filename: str) -> Path: ...
    def open_for_read(self, path: Path) -> BinaryIO: ...
    def delete(self, path: Path) -> None: ...
    def file_size(self, path: Path) -> int: ...
    def stream_full(self, path: Path) -> Iterator[bytes]: ...
    def stream_range(self, path: Path, start: int, end: int) -> Iterator[bytes]: ...


def _sanitize_filename(filename: str) -> str:
    name = Path(filename).name
    name = re.sub(r"[^\w.\-]", "_", name)
    return name or "upload"


class LocalStorageAdapter:
    def __init__(self, base_dir: Path | None = None) -> None:
        self._base_dir = base_dir or settings.STORAGE_DIR

    def _video_dir(self, video_uuid: str) -> Path:
        d = self._base_dir / video_uuid
        d.mkdir(parents=True, exist_ok=True)
        return d

    def save_stream(self, stream: BinaryIO, filename: str) -> Path:
        safe_name = _sanitize_filename(filename)
        video_uuid = str(uuid.uuid4())
        target = self._video_dir(video_uuid) / safe_name
        try:
            with target.open("wb") as f:
                while chunk := stream.read(CHUNK_SIZE):
                    f.write(chunk)
        except OSError as exc:
            raise StorageError(f"Failed to save file: {exc}") from exc
        return target

    def open_for_read(self, path: Path) -> BinaryIO:
        try:
            return open(path, "rb")  # noqa: SIM115
        except OSError as exc:
            raise StorageError(f"Failed to open file: {exc}") from exc

    def delete(self, path: Path) -> None:
        try:
            path.unlink(missing_ok=True)
            try:
                path.parent.rmdir()
            except OSError:
                pass
        except OSError as exc:
            raise StorageError(f"Failed to delete file: {exc}") from exc

    def file_size(self, path: Path) -> int:
        try:
            return path.stat().st_size
        except OSError as exc:
            raise StorageError(f"Failed to stat file: {exc}") from exc

    def stream_full(self, path: Path) -> Iterator[bytes]:
        with self.open_for_read(path) as f:
            while chunk := f.read(CHUNK_SIZE):
                yield chunk

    def stream_range(self, path: Path, start: int, end: int) -> Iterator[bytes]:
        with self.open_for_read(path) as f:
            f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk = f.read(min(CHUNK_SIZE, remaining))
                if not chunk:
                    break
                yield chunk
                remaining -= len(chunk)
