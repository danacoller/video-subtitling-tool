import uuid

from app.domain.vtt import serialize_vtt
from app.errors import CueNotFoundError, InvalidCueError, VideoNotFoundError
from app.models import Subtitle
from app.repositories.subtitle_repo import SubtitleRepositoryProtocol
from app.repositories.video_repo import VideoRepositoryProtocol
from app.schemas.subtitle_schemas import CueCreate, CuePatch


class SubtitleService:
    def __init__(
        self,
        subtitle_repo: SubtitleRepositoryProtocol,
        video_repo: VideoRepositoryProtocol,
    ) -> None:
        self._subtitle_repo = subtitle_repo
        self._video_repo = video_repo

    async def list_cues(self, video_id: uuid.UUID) -> list[Subtitle]:
        return await self._subtitle_repo.list_by_video(video_id)

    async def add_cue(
        self,
        video_id: uuid.UUID,
        start_ms: int,
        end_ms: int,
        text: str,
    ) -> Subtitle:
        video = await self._video_repo.get_by_id(video_id)
        if video is None:
            raise VideoNotFoundError(f"Video {video_id} not found")

        if end_ms <= start_ms:
            raise InvalidCueError(
                f"end_ms ({end_ms}) must be greater than start_ms ({start_ms})"
            )

        existing = await self._subtitle_repo.list_by_video(video_id)
        position = (max((s.position for s in existing), default=0) + 1)

        subtitle = Subtitle(
            video_id=video_id,
            start_ms=start_ms,
            end_ms=end_ms,
            text=text,
            position=position,
        )
        return await self._subtitle_repo.create(subtitle)

    async def update_cue(self, cue_id: uuid.UUID, patch: CuePatch) -> Subtitle:
        subtitle = await self._subtitle_repo.get_by_id(cue_id)
        if subtitle is None:
            raise CueNotFoundError(f"Cue {cue_id} not found")

        new_start = patch.start_ms if patch.start_ms is not None else subtitle.start_ms
        new_end = patch.end_ms if patch.end_ms is not None else subtitle.end_ms

        if new_end <= new_start:
            raise InvalidCueError(
                f"end_ms ({new_end}) must be greater than start_ms ({new_start})"
            )

        if patch.start_ms is not None:
            subtitle.start_ms = patch.start_ms
        if patch.end_ms is not None:
            subtitle.end_ms = patch.end_ms
        if patch.text is not None:
            subtitle.text = patch.text

        return await self._subtitle_repo.update(subtitle)

    async def delete_cue(self, cue_id: uuid.UUID) -> None:
        subtitle = await self._subtitle_repo.get_by_id(cue_id)
        if subtitle is None:
            raise CueNotFoundError(f"Cue {cue_id} not found")
        await self._subtitle_repo.delete(cue_id)

    async def bulk_replace(
        self, video_id: uuid.UUID, cues: list[CueCreate]
    ) -> list[Subtitle]:
        video = await self._video_repo.get_by_id(video_id)
        if video is None:
            raise VideoNotFoundError(f"Video {video_id} not found")

        new_subtitles = []
        for i, cue in enumerate(cues, start=1):
            if cue.end_ms <= cue.start_ms:
                raise InvalidCueError(
                    f"Cue {i}: end_ms ({cue.end_ms}) must be greater than start_ms ({cue.start_ms})"
                )
            new_subtitles.append(
                Subtitle(
                    video_id=video_id,
                    start_ms=cue.start_ms,
                    end_ms=cue.end_ms,
                    text=cue.text,
                    position=i,
                )
            )

        return await self._subtitle_repo.bulk_replace(video_id, new_subtitles)

    async def export_vtt(self, video_id: uuid.UUID) -> str:
        video = await self._video_repo.get_by_id(video_id)
        if video is None:
            raise VideoNotFoundError(f"Video {video_id} not found")

        cues = await self._subtitle_repo.list_by_video(video_id)
        return serialize_vtt(cues)
