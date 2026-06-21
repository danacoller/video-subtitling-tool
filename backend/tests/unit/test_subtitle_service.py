import uuid

import pytest

from app.errors import CueNotFoundError, InvalidCueError, VideoNotFoundError
from app.models import Video
from app.repositories.fakes import FakeJobRepository, FakeSubtitleRepository, FakeVideoRepository
from app.schemas.subtitle_schemas import CueCreate, CuePatch
from app.services.subtitle_service import SubtitleService


def _make_video() -> Video:
    return Video(
        id=uuid.uuid4(),
        original_name="test.mp4",
        content_type="video/mp4",
        size_bytes=1024,
        storage_path=f"/tmp/{uuid.uuid4()}.mp4",
        status="uploaded",
    )


@pytest.fixture()
def service_with_video():
    video_repo = FakeVideoRepository()
    subtitle_repo = FakeSubtitleRepository()
    svc = SubtitleService(subtitle_repo=subtitle_repo, video_repo=video_repo)
    return svc, video_repo, subtitle_repo


@pytest.mark.asyncio
async def test_add_cue_happy_path(service_with_video):
    svc, video_repo, _ = service_with_video
    video = await video_repo.create(_make_video())
    cue = await svc.add_cue(video.id, start_ms=0, end_ms=1000, text="Hello")
    assert cue.start_ms == 0
    assert cue.end_ms == 1000
    assert cue.text == "Hello"
    assert cue.position == 1


@pytest.mark.asyncio
async def test_add_cue_end_lte_start_raises(service_with_video):
    svc, video_repo, _ = service_with_video
    video = await video_repo.create(_make_video())
    with pytest.raises(InvalidCueError):
        await svc.add_cue(video.id, start_ms=1000, end_ms=1000, text="Oops")


@pytest.mark.asyncio
async def test_add_cue_nonexistent_video_raises(service_with_video):
    svc, _, _ = service_with_video
    with pytest.raises(VideoNotFoundError):
        await svc.add_cue(uuid.uuid4(), start_ms=0, end_ms=500, text="Hi")


@pytest.mark.asyncio
async def test_update_nonexistent_cue_raises(service_with_video):
    svc, _, _ = service_with_video
    with pytest.raises(CueNotFoundError):
        await svc.update_cue(uuid.uuid4(), CuePatch(text="new"))


@pytest.mark.asyncio
async def test_update_cue_invalid_timing_raises(service_with_video):
    svc, video_repo, _ = service_with_video
    video = await video_repo.create(_make_video())
    cue = await svc.add_cue(video.id, start_ms=0, end_ms=1000, text="Hello")
    with pytest.raises(InvalidCueError):
        await svc.update_cue(cue.id, CuePatch(end_ms=0))


@pytest.mark.asyncio
async def test_bulk_replace_empties_and_replaces(service_with_video):
    svc, video_repo, _ = service_with_video
    video = await video_repo.create(_make_video())
    await svc.add_cue(video.id, start_ms=0, end_ms=1000, text="Old cue")
    new_cues = [
        CueCreate(start_ms=0, end_ms=500, text="New A"),
        CueCreate(start_ms=500, end_ms=1500, text="New B"),
    ]
    result = await svc.bulk_replace(video.id, new_cues)
    assert len(result) == 2
    assert result[0].text == "New A"
    assert result[1].text == "New B"
    assert result[0].position == 1
    assert result[1].position == 2


@pytest.mark.asyncio
async def test_export_vtt_produces_valid_webvtt(service_with_video):
    svc, video_repo, _ = service_with_video
    video = await video_repo.create(_make_video())
    await svc.add_cue(video.id, start_ms=0, end_ms=1000, text="Hello")
    vtt = await svc.export_vtt(video.id)
    assert vtt.startswith("WEBVTT")
    assert "00:00:00.000 --> 00:00:01.000" in vtt
    assert "Hello" in vtt


@pytest.mark.asyncio
async def test_export_vtt_empty_list_returns_header_only(service_with_video):
    svc, video_repo, _ = service_with_video
    video = await video_repo.create(_make_video())
    vtt = await svc.export_vtt(video.id)
    assert vtt.strip() == "WEBVTT"


@pytest.mark.asyncio
async def test_delete_cue(service_with_video):
    svc, video_repo, _ = service_with_video
    video = await video_repo.create(_make_video())
    cue = await svc.add_cue(video.id, start_ms=0, end_ms=500, text="X")
    await svc.delete_cue(cue.id)
    remaining = await svc.list_cues(video.id)
    assert len(remaining) == 0


@pytest.mark.asyncio
async def test_delete_nonexistent_cue_raises(service_with_video):
    svc, _, _ = service_with_video
    with pytest.raises(CueNotFoundError):
        await svc.delete_cue(uuid.uuid4())
