import uuid

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.repositories.subtitle_repo import SubtitleRepository
from app.repositories.video_repo import VideoRepository
from app.schemas.subtitle_schemas import (
    BulkCuesRequest,
    CueCreate,
    CuePatch,
    CueResponse,
)
from app.services.subtitle_service import SubtitleService

router = APIRouter(tags=["subtitles"])


def _get_service(session: AsyncSession = Depends(get_db)) -> SubtitleService:
    return SubtitleService(
        subtitle_repo=SubtitleRepository(session),
        video_repo=VideoRepository(session),
    )


@router.get("/videos/{video_id}/subtitles", response_model=list[CueResponse])
async def list_cues(
    video_id: uuid.UUID,
    service: SubtitleService = Depends(_get_service),
) -> list[CueResponse]:
    cues = await service.list_cues(video_id)
    return [CueResponse.model_validate(c) for c in cues]


@router.post("/videos/{video_id}/subtitles", response_model=CueResponse, status_code=201)
async def add_cue(
    video_id: uuid.UUID,
    body: CueCreate,
    service: SubtitleService = Depends(_get_service),
    session: AsyncSession = Depends(get_db),
) -> CueResponse:
    cue = await service.add_cue(
        video_id=video_id,
        start_ms=body.start_ms,
        end_ms=body.end_ms,
        text=body.text,
    )
    await session.commit()
    return CueResponse.model_validate(cue)


@router.patch("/subtitles/{cue_id}", response_model=CueResponse)
async def update_cue(
    cue_id: uuid.UUID,
    body: CuePatch,
    service: SubtitleService = Depends(_get_service),
    session: AsyncSession = Depends(get_db),
) -> CueResponse:
    cue = await service.update_cue(cue_id, body)
    await session.commit()
    return CueResponse.model_validate(cue)


@router.delete("/subtitles/{cue_id}", status_code=204)
async def delete_cue(
    cue_id: uuid.UUID,
    service: SubtitleService = Depends(_get_service),
    session: AsyncSession = Depends(get_db),
) -> None:
    await service.delete_cue(cue_id)
    await session.commit()


@router.put("/videos/{video_id}/subtitles", response_model=list[CueResponse])
async def bulk_replace_cues(
    video_id: uuid.UUID,
    body: BulkCuesRequest,
    service: SubtitleService = Depends(_get_service),
    session: AsyncSession = Depends(get_db),
) -> list[CueResponse]:
    cues = await service.bulk_replace(video_id, body.cues)
    await session.commit()
    return [CueResponse.model_validate(c) for c in cues]


@router.get("/videos/{video_id}/subtitles.vtt")
async def export_vtt(
    video_id: uuid.UUID,
    service: SubtitleService = Depends(_get_service),
) -> Response:
    vtt = await service.export_vtt(video_id)
    return Response(
        content=vtt,
        media_type="text/vtt",
        headers={"Content-Disposition": f'attachment; filename="subtitles-{video_id}.vtt"'},
    )
