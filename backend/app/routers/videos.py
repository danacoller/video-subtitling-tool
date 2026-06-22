import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.storage import LocalStorageAdapter
from app.db import get_db
from app.repositories.video_repo import VideoRepository
from app.schemas.video_schemas import VideoResponse
from app.services.video_service import VideoService

router = APIRouter(tags=["videos"])


def _get_service(session: AsyncSession = Depends(get_db)) -> VideoService:
    return VideoService(
        repo=VideoRepository(session),
        storage=LocalStorageAdapter(),
    )


@router.get("/videos", response_model=list[VideoResponse])
async def list_videos(
    service: VideoService = Depends(_get_service),
) -> list[VideoResponse]:
    videos = await service.list_all()
    return [VideoResponse.model_validate(v) for v in videos]


@router.post("/videos", response_model=VideoResponse, status_code=201)
async def upload_video(
    file: UploadFile,
    service: VideoService = Depends(_get_service),
    session: AsyncSession = Depends(get_db),
) -> VideoResponse:
    video = await service.upload(
        filename=file.filename or "upload",
        content_type=file.content_type or "application/octet-stream",
        stream=file.file,
    )
    await session.commit()
    return VideoResponse.model_validate(video)


@router.get("/videos/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: uuid.UUID,
    service: VideoService = Depends(_get_service),
) -> VideoResponse:
    video = await service.get(video_id)
    return VideoResponse.model_validate(video)


@router.delete("/videos", status_code=204)
async def delete_all_videos(
    service: VideoService = Depends(_get_service),
    session: AsyncSession = Depends(get_db),
) -> None:
    await service.delete_all()
    await session.commit()


@router.delete("/videos/{video_id}", status_code=204)
async def delete_video(
    video_id: uuid.UUID,
    service: VideoService = Depends(_get_service),
    session: AsyncSession = Depends(get_db),
) -> None:
    await service.delete(video_id)
    await session.commit()


@router.get("/videos/{video_id}/stream")
async def stream_video(
    video_id: uuid.UUID,
    request: Request,
    service: VideoService = Depends(_get_service),
) -> Response:
    video = await service.get(video_id)
    storage = service.storage
    path = Path(video.storage_path)
    file_size = storage.file_size(path)

    range_header = request.headers.get("Range")
    if range_header is None:
        return StreamingResponse(
            storage.stream_full(path),
            media_type=video.content_type,
            headers={"Content-Length": str(file_size)},
        )

    start, end = _parse_range_header(range_header, file_size)
    if start is None:
        return Response(status_code=416)

    if start >= file_size or end >= file_size or start > end:
        return Response(
            status_code=416,
            headers={"Content-Range": f"bytes */{file_size}"},
        )

    return StreamingResponse(
        storage.stream_range(path, start, end),
        status_code=206,
        media_type=video.content_type,
        headers={
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(end - start + 1),
            "Accept-Ranges": "bytes",
        },
    )


def _parse_range_header(
    range_header: str, file_size: int
) -> tuple[int, int] | tuple[None, None]:
    try:
        range_value = range_header.replace("bytes=", "")
        parts = range_value.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1
        return start, end
    except (ValueError, IndexError):
        return None, None
