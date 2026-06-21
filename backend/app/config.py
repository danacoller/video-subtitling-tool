from pathlib import Path

from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/subtitles"
    )
    STORAGE_DIR: Path = Path("/data/videos")
    MAX_UPLOAD_BYTES: int = 2 * 1024 * 1024 * 1024  # 2 GB
    # Comma-separated string — avoids pydantic-settings trying to JSON-decode a set[str]
    ALLOWED_CONTENT_TYPES_RAW: str = (
        "video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm"
    )
    WHISPER_MODEL: str = "tiny"
    WORKER_POLL_INTERVAL: int = 3

    @computed_field  # type: ignore[misc]
    @property
    def ALLOWED_CONTENT_TYPES(self) -> set[str]:
        return {s.strip() for s in self.ALLOWED_CONTENT_TYPES_RAW.split(",") if s.strip()}


settings = Settings()
