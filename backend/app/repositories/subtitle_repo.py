import uuid
from typing import Protocol

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Subtitle


class SubtitleRepositoryProtocol(Protocol):
    async def create(self, subtitle: Subtitle) -> Subtitle: ...
    async def list_by_video(self, video_id: uuid.UUID) -> list[Subtitle]: ...
    async def get_by_id(self, subtitle_id: uuid.UUID) -> Subtitle | None: ...
    async def update(self, subtitle: Subtitle) -> Subtitle: ...
    async def delete(self, subtitle_id: uuid.UUID) -> None: ...
    async def bulk_replace(
        self, video_id: uuid.UUID, subtitles: list[Subtitle]
    ) -> list[Subtitle]: ...


class SubtitleRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def create(self, subtitle: Subtitle) -> Subtitle:
        self._session.add(subtitle)
        await self._session.flush()
        await self._session.refresh(subtitle)
        return subtitle

    async def list_by_video(self, video_id: uuid.UUID) -> list[Subtitle]:
        result = await self._session.execute(
            select(Subtitle)
            .where(Subtitle.video_id == video_id)
            .order_by(Subtitle.start_ms)
        )
        return list(result.scalars().all())

    async def get_by_id(self, subtitle_id: uuid.UUID) -> Subtitle | None:
        result = await self._session.execute(
            select(Subtitle).where(Subtitle.id == subtitle_id)
        )
        return result.scalar_one_or_none()

    async def update(self, subtitle: Subtitle) -> Subtitle:
        await self._session.flush()
        await self._session.refresh(subtitle)
        return subtitle

    async def delete(self, subtitle_id: uuid.UUID) -> None:
        await self._session.execute(
            delete(Subtitle).where(Subtitle.id == subtitle_id)
        )
        await self._session.flush()

    async def bulk_replace(
        self, video_id: uuid.UUID, subtitles: list[Subtitle]
    ) -> list[Subtitle]:
        await self._session.execute(
            delete(Subtitle).where(Subtitle.video_id == video_id)
        )
        for sub in subtitles:
            self._session.add(sub)
        await self._session.flush()
        for sub in subtitles:
            await self._session.refresh(sub)
        return subtitles
