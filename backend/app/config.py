from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5432/subtitles"
    )
    STORAGE_DIR: Path = Path("/data/videos")
    MAX_UPLOAD_BYTES: int = 2 * 1024 * 1024 * 1024  # 2 GB
    ALLOWED_CONTENT_TYPES: set[str] = {
        "video/mp4",
        "video/quicktime",
        "video/x-msvideo",
        "video/x-matroska",
        "video/webm",
    }
    WHISPER_MODEL: str = "base"
    WORKER_POLL_INTERVAL: int = 3

    @field_validator("ALLOWED_CONTENT_TYPES", mode="before")
    @classmethod
    def parse_content_types(cls, v: object) -> object:
        if isinstance(v, str):
            return {s.strip() for s in v.split(",") if s.strip()}
        return v


settings = Settings()
