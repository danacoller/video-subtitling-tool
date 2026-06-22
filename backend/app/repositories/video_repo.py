import uuid
from typing import Protocol

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Video


class VideoRepositoryProtocol(Protocol):
    async def create(self, video: Video) -> Video: ...
    async def get_by_id(self, video_id: uuid.UUID) -> Video | None: ...
    async def list_all(self) -> list[Video]: ...
    async def delete(self, video_id: uuid.UUID) -> bool: ...
    async def delete_all(self) -> list[Video]: ...


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

    async def delete(self, video_id: uuid.UUID) -> bool:
        video = await self.get_by_id(video_id)
        if video is None:
            return False
        await self._session.delete(video)
        await self._session.flush()
        return True

    async def delete_all(self) -> list[Video]:
        all_videos = await self.list_all()
        await self._session.execute(delete(Video))
        await self._session.flush()
        return all_videos
