# Video Subtitling Tool

A full-stack tool that lets you upload a video, auto-generate subtitles with Whisper, edit the subtitle cues in a browser-based editor, and export them as WebVTT.

---

## Architecture

```
┌──────────────┐     ┌─────────────────────────────────────────────┐
│   Browser    │────▶│  Frontend (React + Vite, served by nginx)   │
└──────────────┘     └───────────────────┬─────────────────────────┘
                                         │ /api/*
                     ┌───────────────────▼─────────────────────────┐
                     │   API (FastAPI, uvicorn)                     │
                     │   ┌──────────┐ ┌──────────┐ ┌────────────┐ │
                     │   │ /videos  │ │/subtitles│ │  /jobs     │ │
                     │   └────┬─────┘ └────┬─────┘ └─────┬──────┘ │
                     │        │            │             │         │
                     │   ┌────▼────────────▼─────────────▼──────┐  │
                     │   │  Services (VideoService,              │  │
                     │   │  SubtitleService, TranscriptionService)│  │
                     │   └────────────────────┬──────────────────┘  │
                     │                        │                     │
                     │   ┌────────────────────▼──────────────────┐  │
                     │   │  Repositories (SQLAlchemy async)       │  │
                     │   └────────────────────┬──────────────────┘  │
                     └────────────────────────┼─────────────────────┘
                                              │
              ┌──────────────────┐            │
              │ Worker (Python)  │            │
              │ polls DB, runs   │◀───────────┤
              │ ffmpeg + Whisper │            │
              └──────────────────┘   ┌────────▼────────┐
                                     │  PostgreSQL 16   │
                                     └─────────────────┘
```

**Layer hierarchy:** `routers → services → repositories → adapters`

---

## Stack & Design Decisions

| Component | Choice | Why |
|-----------|--------|-----|
| API framework | FastAPI | Async-native, automatic OpenAPI, pydantic validation |
| ORM | SQLAlchemy 2.0 async | Type-safe, async sessions, Alembic migrations |
| Database | PostgreSQL 16 | Reliable, UUID support, transactional bulk-replace |
| Transcription | faster-whisper | CTranslate2 backend — 4× faster than openai-whisper, int8 quantization |
| Audio extraction | ffmpeg-python | Python bindings for FFmpeg, temp WAV extraction |
| Video playback | HTTP range requests | Native browser `<video>` support without streaming server |
| Frontend | React + TypeScript + Vite | Fast dev builds, strict types |
| State management | `useState`/`useReducer` | No external library needed for this scope |
| Worker pattern | Poll loop + atomic claim | Simple, crash-safe, no message broker required |

---

## Running with Docker

```bash
# 1. Copy the environment file
cp .env.example .env

# 2. Build and start all four containers
docker compose up --build

# 3. Open the app
open http://localhost:3000
```

Services:
- **Frontend** — http://localhost:3000
- **API** — http://localhost:8000 (also available via the frontend proxy at `/api/`)
- **PostgreSQL** — port 5432 (internal)

### Data persistence

Named Docker volumes guarantee durability across restarts:
- `postgres_data` — Postgres WAL + data files
- `video_uploads` — uploaded video files

A `docker compose restart` will **not** lose any videos or database records.

---

## Running Tests

```bash
cd backend

# Install dev dependencies
pip install -e ".[dev]"

# Run all tests
pytest

# With coverage report
pytest --cov=app --cov-report=term-missing
```

Unit tests use in-memory fake repositories — no database or storage required.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Healthcheck |
| POST | `/api/v1/videos` | Upload a video (multipart/form-data) |
| GET | `/api/v1/videos/{id}` | Video metadata |
| GET | `/api/v1/videos/{id}/stream` | HTTP range-request streaming |
| POST | `/api/v1/videos/{id}/transcribe` | Enqueue transcription job |
| GET | `/api/v1/videos/{id}/job` | Job status + progress |
| GET | `/api/v1/videos/{id}/subtitles` | List cues |
| POST | `/api/v1/videos/{id}/subtitles` | Add a cue |
| PATCH | `/api/v1/subtitles/{id}` | Update a cue |
| DELETE | `/api/v1/subtitles/{id}` | Delete a cue |
| PUT | `/api/v1/videos/{id}/subtitles` | Bulk replace all cues |
| GET | `/api/v1/videos/{id}/subtitles.vtt` | Export WebVTT |

All errors return `{"code": "...", "message": "...", "details": "..."}`.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://...` | Async Postgres connection string |
| `STORAGE_DIR` | `/data/videos` | Directory where uploaded videos are stored |
| `MAX_UPLOAD_BYTES` | `2147483648` (2 GB) | Maximum upload size |
| `ALLOWED_CONTENT_TYPES` | mp4, mov, avi, mkv, webm | Comma-separated allowed MIME types |
| `WHISPER_MODEL` | `base` | faster-whisper model size (tiny/base/small/medium/large) |
| `WORKER_POLL_INTERVAL` | `3` | Seconds between worker poll cycles |
