"""Integration tests for the subtitle CRUD, bulk-replace, and VTT export endpoints."""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Video
from app.repositories.fakes import FakeSubtitleRepository, FakeVideoRepository
from app.routers.subtitles import _get_service
from app.services.subtitle_service import SubtitleService


def _make_video(video_id: uuid.UUID | None = None) -> Video:
    return Video(
        id=video_id or uuid.uuid4(),
        original_name="test.mp4",
        content_type="video/mp4",
        size_bytes=1024,
        storage_path=f"/tmp/{uuid.uuid4()}.mp4",
        status="uploaded",
    )


@pytest.fixture()
def video_repo():
    return FakeVideoRepository()


@pytest.fixture()
def subtitle_repo():
    return FakeSubtitleRepository()


@pytest.fixture()
def client(video_repo, subtitle_repo):
    def override_service():
        return SubtitleService(subtitle_repo=subtitle_repo, video_repo=video_repo)

    app.dependency_overrides[_get_service] = override_service
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture()
async def video(video_repo):
    return await video_repo.create(_make_video())


@pytest.mark.asyncio
async def test_add_and_list_cue(client, video):
    response = client.post(
        f"/api/v1/videos/{video.id}/subtitles",
        json={"start_ms": 0, "end_ms": 1000, "text": "Hello"},
    )
    assert response.status_code == 201
    cue = response.json()
    assert cue["text"] == "Hello"
    assert cue["start_ms"] == 0

    list_response = client.get(f"/api/v1/videos/{video.id}/subtitles")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


@pytest.mark.asyncio
async def test_patch_cue(client, video):
    create = client.post(
        f"/api/v1/videos/{video.id}/subtitles",
        json={"start_ms": 0, "end_ms": 1000, "text": "Original"},
    )
    cue_id = create.json()["id"]

    patch = client.patch(f"/api/v1/subtitles/{cue_id}", json={"text": "Updated"})
    assert patch.status_code == 200
    assert patch.json()["text"] == "Updated"


@pytest.mark.asyncio
async def test_patch_invalid_timing_returns_422(client, video):
    create = client.post(
        f"/api/v1/videos/{video.id}/subtitles",
        json={"start_ms": 1000, "end_ms": 2000, "text": "Hi"},
    )
    cue_id = create.json()["id"]

    response = client.patch(f"/api/v1/subtitles/{cue_id}", json={"end_ms": 500})
    assert response.status_code == 422
    assert "code" in response.json()


@pytest.mark.asyncio
async def test_delete_cue(client, video):
    create = client.post(
        f"/api/v1/videos/{video.id}/subtitles",
        json={"start_ms": 0, "end_ms": 500, "text": "Bye"},
    )
    cue_id = create.json()["id"]

    delete = client.delete(f"/api/v1/subtitles/{cue_id}")
    assert delete.status_code == 204

    listed = client.get(f"/api/v1/videos/{video.id}/subtitles")
    assert listed.json() == []


@pytest.mark.asyncio
async def test_delete_nonexistent_returns_404(client, video):
    response = client.delete(f"/api/v1/subtitles/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["code"] == "cue_not_found"


@pytest.mark.asyncio
async def test_bulk_replace(client, video):
    # Add an initial cue
    client.post(
        f"/api/v1/videos/{video.id}/subtitles",
        json={"start_ms": 0, "end_ms": 1000, "text": "Old"},
    )

    # Bulk replace with 2 new cues
    response = client.put(
        f"/api/v1/videos/{video.id}/subtitles",
        json={"cues": [
            {"start_ms": 0, "end_ms": 500, "text": "New A"},
            {"start_ms": 500, "end_ms": 1500, "text": "New B"},
        ]},
    )
    assert response.status_code == 200
    cues = response.json()
    assert len(cues) == 2
    assert cues[0]["text"] == "New A"
    assert cues[1]["text"] == "New B"


@pytest.mark.asyncio
async def test_export_vtt_content_type(client, video):
    client.post(
        f"/api/v1/videos/{video.id}/subtitles",
        json={"start_ms": 0, "end_ms": 1000, "text": "Hello"},
    )
    response = client.get(f"/api/v1/videos/{video.id}/subtitles.vtt")
    assert response.status_code == 200
    assert "text/vtt" in response.headers["content-type"]
    assert response.text.startswith("WEBVTT")
    assert "00:00:00.000 --> 00:00:01.000" in response.text


@pytest.mark.asyncio
async def test_export_vtt_empty_subtitles(client, video):
    response = client.get(f"/api/v1/videos/{video.id}/subtitles.vtt")
    assert response.status_code == 200
    assert response.text.strip() == "WEBVTT"
