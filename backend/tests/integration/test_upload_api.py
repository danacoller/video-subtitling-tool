"""Integration tests for the upload and video streaming API endpoints."""
import io
import uuid
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.errors import VideoNotFoundError
from app.main import app
from app.models import Video
from app.repositories.fakes import FakeVideoRepository
from app.routers.videos import _get_service
from app.services.video_service import VideoService


class FakeStorage:
    def __init__(self):
        self._files: dict[str, bytes] = {}

    def save_stream(self, stream, filename: str) -> Path:
        data = stream.read()
        key = f"/fake/{uuid.uuid4()}/{filename}"
        self._files[key] = data
        return Path(key)

    def open_for_read(self, path: Path):
        return io.BytesIO(self._files.get(str(path), b""))

    def delete(self, path: Path) -> None:
        self._files.pop(str(path), None)

    def file_size(self, path: Path) -> int:
        return len(self._files.get(str(path), b""))


@pytest.fixture()
def video_repo():
    return FakeVideoRepository()


@pytest.fixture()
def storage():
    return FakeStorage()


@pytest.fixture()
def client(video_repo, storage):
    def override_service():
        return VideoService(repo=video_repo, storage=storage)

    app.dependency_overrides[_get_service] = override_service
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


def test_upload_small_file(client):
    data = b"fake mp4 data"
    response = client.post(
        "/api/v1/videos",
        files={"file": ("test.mp4", io.BytesIO(data), "video/mp4")},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["original_name"] == "test.mp4"
    assert body["content_type"] == "video/mp4"
    assert body["status"] == "uploaded"
    assert "id" in body


def test_upload_unsupported_type_returns_422(client):
    response = client.post(
        "/api/v1/videos",
        files={"file": ("doc.pdf", io.BytesIO(b"pdf"), "application/pdf")},
    )
    assert response.status_code == 422
    assert "code" in response.json()


def test_get_uploaded_video(client):
    data = b"video bytes"
    upload = client.post(
        "/api/v1/videos",
        files={"file": ("clip.mp4", io.BytesIO(data), "video/mp4")},
    )
    video_id = upload.json()["id"]

    response = client.get(f"/api/v1/videos/{video_id}")
    assert response.status_code == 200
    assert response.json()["id"] == video_id


def test_get_missing_video_returns_404(client):
    response = client.get(f"/api/v1/videos/{uuid.uuid4()}")
    assert response.status_code == 404
    assert response.json()["code"] == "video_not_found"


def test_stream_full_content_no_range_header(client, storage):
    content = b"binary video content"
    upload = client.post(
        "/api/v1/videos",
        files={"file": ("v.mp4", io.BytesIO(content), "video/mp4")},
    )
    video_id = upload.json()["id"]

    response = client.get(f"/api/v1/videos/{video_id}/stream")
    assert response.status_code == 200
    assert response.content == content


def test_stream_range_request_returns_206(client):
    content = b"0123456789abcdef"  # 16 bytes
    upload = client.post(
        "/api/v1/videos",
        files={"file": ("v.mp4", io.BytesIO(content), "video/mp4")},
    )
    video_id = upload.json()["id"]

    response = client.get(
        f"/api/v1/videos/{video_id}/stream",
        headers={"Range": "bytes=0-7"},
    )
    assert response.status_code == 206
    assert response.content == b"01234567"
    assert "Content-Range" in response.headers


def test_stream_invalid_range_returns_416(client):
    content = b"short"
    upload = client.post(
        "/api/v1/videos",
        files={"file": ("v.mp4", io.BytesIO(content), "video/mp4")},
    )
    video_id = upload.json()["id"]

    response = client.get(
        f"/api/v1/videos/{video_id}/stream",
        headers={"Range": "bytes=100-200"},
    )
    assert response.status_code == 416
