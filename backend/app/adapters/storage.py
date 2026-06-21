import re
import uuid
from pathlib import Path
from typing import BinaryIO, Protocol

from app.config import settings
from app.errors import StorageError


class StorageAdapter(Protocol):
    def save_stream(self, stream: BinaryIO, filename: str) -> Path: ...
    def open_for_read(self, path: Path) -> BinaryIO: ...
    def delete(self, path: Path) -> None: ...
    def file_size(self, path: Path) -> int: ...


def _sanitize_filename(filename: str) -> str:
    """Remove path traversal characters and keep only safe filename characters."""
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
                while chunk := stream.read(1024 * 1024):  # 1 MB chunks
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
        except OSError as exc:
            raise StorageError(f"Failed to delete file: {exc}") from exc

    def file_size(self, path: Path) -> int:
        try:
            return path.stat().st_size
        except OSError as exc:
            raise StorageError(f"Failed to stat file: {exc}") from exc
