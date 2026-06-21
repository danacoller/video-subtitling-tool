import uuid
from typing import Protocol

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Video


class VideoRepositoryProtocol(Protocol):
    async def create(self, video: Video) -> Video: ...
    async def get_by_id(self, video_id: uuid.UUID) -> Video | None: ...
    async def list_all(self) -> list[Video]: ...
    async def update_status(self, video_id: uuid.UUID, status: str) -> Video | None: ...


class VideoRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, video: Video) -> Video:
        self._session.add(video)
        await self._session.flush()
        await self._session.refresh(video)
        return video

    async def get_by_id(self, video_id: uuid.UUID) -> Video | None:
        result = await self._session.execute(
            select(Video).where(Video.id == video_id)
        )
        return result.scalar_one_or_none()

    async def list_all(self) -> list[Video]:
        result = await self._session.execute(
            select(Video).order_by(Video.created_at.desc())
        )
        return list(result.scalars().all())

    async def update_status(self, video_id: uuid.UUID, status: str) -> Video | None:
        video = await self.get_by_id(video_id)
        if video is None:
            return None
        video.status = status
        await self._session.flush()
        return video
