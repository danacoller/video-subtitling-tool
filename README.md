# Video Subtitling Tool

Upload a video, auto-generate subtitles with Whisper, edit cues in the browser, and export WebVTT.

**Architecture diagrams & flows:** [architecture.md](./architecture.md)

---

## What it does

1. Upload a video (MP4, MOV, AVI, MKV, WebM)
2. Transcribe speech in the background (faster-whisper)
3. Edit subtitle cues synced to video playback
4. Export as WebVTT

---

## Run with Docker

All commands from `video-subtitling-tool/`:

```bash
cp .env.example .env
docker compose up --build
```

| What | URL |
|------|-----|
| App (UI) | http://localhost:3000 |
| API (direct) | http://localhost:8000 |
| API (via frontend proxy) | http://localhost:3000/api/ |
| OpenAPI docs | http://localhost:8000/docs |

```bash
docker compose up --build -d          # run in background
docker compose logs -f api worker     # tail logs
docker compose down                   # stop (keeps volumes)
docker compose down -v                # stop + wipe DB and uploads
```

On startup the API runs `alembic upgrade head` then starts uvicorn. Uploaded videos and DB rows persist in Docker volumes across restarts.

---

## Test with Docker

No local Python or Node install required. From `video-subtitling-tool/`:

```bash
# Backend
docker compose --profile test run --rm --no-deps backend-test

# Backend with coverage
docker compose --profile test run --rm --no-deps backend-test \
  pytest --cov=app --cov-report=term-missing

# Frontend
docker compose --profile test run --rm --no-deps frontend-test
```

---

## Run without Docker

**Requires:** Python 3.12+, Node 20+, PostgreSQL 16, ffmpeg.

### 1. Environment and database

From `video-subtitling-tool/`:

```bash
cp .env.example .env
mkdir -p /tmp/videos
```

Set `STORAGE_DIR=/tmp/videos` in `.env` (the default `/data/videos` needs root locally).

Start Postgres (pick one):

```bash
createdb subtitles                     # local Postgres
# OR
docker compose up db -d                # Postgres in Docker only
```

### 2. Backend + worker

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
cp ../.env .env
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

Second terminal — worker:

```bash
cd backend && source .venv/bin/activate
cp ../.env .env
python -m app.worker
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — Vite proxies `/api` to http://localhost:8000.

---

## Test without Docker

### Backend

From `backend/`:

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
pytest

# With coverage
pytest --cov=app --cov-report=term-missing
```

Unit tests use in-memory fake repositories — no database or storage required.

### Frontend

From `frontend/`:

```bash
npm install
npm test              # single run
npm run test:watch    # watch mode
npm run build         # typecheck + production build
```

---

## Frontend scripts

From `frontend/`:

| Script | Command | Purpose |
|--------|---------|---------|
| Dev server | `npm run dev` | http://localhost:5173 |
| Production build | `npm run build` | `tsc` + Vite bundle |
| Preview build | `npm run preview` | Serve `dist/` locally |
| Tests | `npm test` | Vitest single run |
| Tests (watch) | `npm run test:watch` | Vitest watch mode |

---

## Environment variables

Copy `.env.example` → `.env` before starting. Docker Compose overrides `DATABASE_URL` and `STORAGE_DIR` for container networking.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/subtitles` | Async Postgres URL |
| `STORAGE_DIR` | `/data/videos` | Upload storage (use `/tmp/videos` locally) |
| `MAX_UPLOAD_BYTES` | `2147483648` (2 GB) | Max upload size |
| `ALLOWED_CONTENT_TYPES_RAW` | mp4/mov/avi/mkv/webm MIME types | Comma-separated allowed types |
| `WHISPER_MODEL` | `small` | Model size: tiny/base/small/medium/large |
| `WORKER_POLL_INTERVAL` | `3` | Worker idle poll interval (seconds) |
| `MAX_JOB_RETRIES` | `3` | Max requeue attempts for transient failures |

`ALLOWED_CONTENT_TYPES_RAW` is parsed at runtime into `ALLOWED_CONTENT_TYPES` — do not set that name directly in `.env`.

---

## API reference

Base URL:

- Direct: `http://localhost:8000`
- Via frontend proxy: `http://localhost:3000/api`

All errors return JSON:

```json
{"code": "...", "message": "...", "details": "..."}
```

Interactive docs: http://localhost:8000/docs

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Healthcheck |
| GET | `/api/v1/videos` | List all videos |
| POST | `/api/v1/videos` | Upload (`multipart/form-data`, field `file`) |
| GET | `/api/v1/videos/{id}` | Video metadata |
| DELETE | `/api/v1/videos/{id}` | Delete one video |
| DELETE | `/api/v1/videos` | Delete all videos |
| GET | `/api/v1/videos/{id}/stream` | HTTP range-request streaming |
| POST | `/api/v1/videos/{id}/transcribe` | Enqueue transcription (202) |
| GET | `/api/v1/videos/{id}/job` | Job status + progress |
| GET | `/api/v1/jobs` | List all jobs with video info |
| GET | `/api/v1/videos/{id}/subtitles` | List cues |
| POST | `/api/v1/videos/{id}/subtitles` | Add one cue |
| PATCH | `/api/v1/subtitles/{id}` | Update one cue |
| DELETE | `/api/v1/subtitles/{id}` | Delete one cue |
| PUT | `/api/v1/videos/{id}/subtitles` | Bulk replace all cues |
| GET | `/api/v1/videos/{id}/subtitles.vtt` | Export WebVTT |

See [architecture.md](./architecture.md) for API flow diagrams.

---

## API examples

### Health check

```bash
curl -s http://localhost:8000/health
```

```json
{"status": "ok"}
```

### Upload a video

```bash
curl -s -X POST http://localhost:8000/api/v1/videos \
  -F "file=@/path/to/clip.mp4"
```

```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "original_name": "clip.mp4",
  "content_type": "video/mp4",
  "size_bytes": 1048576,
  "duration_seconds": 42.5,
  "status": "uploaded",
  "created_at": "2024-06-01T12:00:00.000Z",
  "updated_at": "2024-06-01T12:00:00.000Z"
}
```

### List videos

```bash
curl -s http://localhost:8000/api/v1/videos
```

### Start transcription

```bash
VIDEO_ID=3fa85f64-5717-4562-b3fc-2c963f66afa6
curl -s -X POST "http://localhost:8000/api/v1/videos/${VIDEO_ID}/transcribe"
```

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "video_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "queued",
  "progress": 0,
  "error_message": null,
  "started_at": null,
  "finished_at": null,
  "created_at": "2024-06-01T12:01:00.000Z",
  "updated_at": "2024-06-01T12:01:00.000Z",
  "queue_position": 1,
  "active_job_progress": null
}
```

### Poll job status

```bash
curl -s "http://localhost:8000/api/v1/videos/${VIDEO_ID}/job"
```

While processing, `status` is `"processing"` and `progress` goes from 1 to 100. When done, `status` is `"completed"`.

### List subtitle cues

```bash
curl -s "http://localhost:8000/api/v1/videos/${VIDEO_ID}/subtitles"
```

```json
[
  {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "video_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "start_ms": 0,
    "end_ms": 2500,
    "text": "Hello world.",
    "position": 1,
    "created_at": "2024-06-01T12:05:00.000Z",
    "updated_at": "2024-06-01T12:05:00.000Z"
  }
]
```

### Bulk replace cues (save editor changes)

```bash
curl -s -X PUT "http://localhost:8000/api/v1/videos/${VIDEO_ID}/subtitles" \
  -H "Content-Type: application/json" \
  -d '{
    "cues": [
      {"start_ms": 0, "end_ms": 2500, "text": "Hello, world!"},
      {"start_ms": 2500, "end_ms": 5000, "text": "Welcome to the demo."}
    ]
  }'
```

Returns the full updated cue list (same shape as GET above).

### Export WebVTT

```bash
curl -s "http://localhost:8000/api/v1/videos/${VIDEO_ID}/subtitles.vtt"
```

```
WEBVTT

1
00:00:00.000 --> 00:00:02.500
Hello, world!

2
00:00:02.500 --> 00:00:05.000
Welcome to the demo.
```

### Stream video

```
GET /api/v1/videos/{id}/stream
Accept-Ranges: bytes
```

Returns `200` (full file) or `206` (partial content with `Range` header).

### Error responses

All application errors return the same JSON shape:

```json
{
  "code": "<error_code>",
  "message": "<human-readable message>",
  "details": null
}
```

`details` is optional and may contain extra context (e.g. Pydantic validation field errors).

#### Summary

| HTTP | `code` | When |
|------|--------|------|
| 404 | `video_not_found` | Video ID does not exist |
| 404 | `job_not_found` | No transcription job for that video |
| 404 | `cue_not_found` | Subtitle cue ID does not exist |
| 409 | `duplicate_job` | Transcribe called while a job is already queued or processing |
| 422 | `invalid_upload` | Disallowed content type or file exceeds size limit |
| 422 | `invalid_cue` | Invalid cue timing (negative or end ≤ start) |
| 422 | `validation_error` | Malformed request body or missing required fields |
| 500 | `storage_error` | Filesystem read/write/delete failure |
| 500 | `transcription_error` | Transcription pipeline failure (reserved) |
| 500 | `internal_error` | Unexpected server error (fallback) |

**Note:** `416 Range Not Satisfiable` is returned by the video stream endpoint for invalid `Range` headers — no JSON body, only `Content-Range: bytes */{size}` header.

**Note:** Worker failures (e.g. corrupted video) do not return HTTP errors. They appear in `GET /api/v1/videos/{id}/job` as `"status": "failed"` with an `error_message` field (see [Job failure](#job-failure-via-get-job) below).

---

#### 404 — `video_not_found`

```bash
curl -s http://localhost:8000/api/v1/videos/00000000-0000-0000-0000-000000000000
```

```json
{
  "code": "video_not_found",
  "message": "Video 00000000-0000-0000-0000-000000000000 not found",
  "details": null
}
```

Also returned by subtitle endpoints and `POST /transcribe` when the video ID is unknown.

---

#### 404 — `job_not_found`

```bash
curl -s http://localhost:8000/api/v1/videos/${VIDEO_ID}/job
```

When the video exists but transcription was never started:

```json
{
  "code": "job_not_found",
  "message": "No transcription job for video 3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "details": null
}
```

---

#### 404 — `cue_not_found`

```bash
curl -s -X DELETE http://localhost:8000/api/v1/subtitles/00000000-0000-0000-0000-000000000000
```

```json
{
  "code": "cue_not_found",
  "message": "Cue 00000000-0000-0000-0000-000000000000 not found",
  "details": null
}
```

Also returned by `PATCH /api/v1/subtitles/{id}`.

---

#### 409 — `duplicate_job`

```bash
# Second POST while first job is still queued or processing
curl -s -X POST "http://localhost:8000/api/v1/videos/${VIDEO_ID}/transcribe"
```

```json
{
  "code": "duplicate_job",
  "message": "A transcription job for video 3fa85f64-5717-4562-b3fc-2c963f66afa6 is already queued",
  "details": null
}
```

---

#### 422 — `invalid_upload`

**Disallowed content type:**

```bash
curl -s -X POST http://localhost:8000/api/v1/videos \
  -F "file=@document.pdf;type=application/pdf"
```

```json
{
  "code": "invalid_upload",
  "message": "Content type 'application/pdf' is not allowed. Allowed: ['video/avi', 'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/x-msvideo']",
  "details": null
}
```

**File too large:**

```json
{
  "code": "invalid_upload",
  "message": "File size 3221225472 exceeds maximum 2147483648",
  "details": null
}
```

---

#### 422 — `invalid_cue`

```bash
curl -s -X PATCH "http://localhost:8000/api/v1/subtitles/${CUE_ID}" \
  -H "Content-Type: application/json" \
  -d '{"end_ms": 500}'
```

When `end_ms` ≤ `start_ms`:

```json
{
  "code": "invalid_cue",
  "message": "end_ms (500) must be greater than start_ms (1000)",
  "details": null
}
```

Also raised for negative timestamps or overlapping cues on bulk replace (`PUT /subtitles`).

---

#### 422 — `validation_error`

Returned when the request body fails Pydantic/FastAPI validation (wrong types, missing fields):

```bash
curl -s -X POST "http://localhost:8000/api/v1/videos/${VIDEO_ID}/subtitles" \
  -H "Content-Type: application/json" \
  -d '{"start_ms": "not-a-number", "end_ms": 1000, "text": "Hi"}'
```

```json
{
  "code": "validation_error",
  "message": "Request validation failed",
  "details": "[{'type': 'int_parsing', 'loc': ('body', 'start_ms'), 'msg': 'Input should be a valid integer', ...}]"
}
```

---

#### 500 — `storage_error`

Returned when a filesystem operation fails (save, read, delete, stat):

```json
{
  "code": "storage_error",
  "message": "Failed to save file: [Errno 28] No space left on device",
  "details": null
}
```

---

#### 500 — `transcription_error`

Reserved for transcription pipeline failures surfaced through the API:

```json
{
  "code": "transcription_error",
  "message": "Transcription failed unexpectedly",
  "details": null
}
```

---

#### 500 — `internal_error`

Fallback for unhandled application errors:

```json
{
  "code": "internal_error",
  "message": "An unexpected error occurred",
  "details": null
}
```

---

#### 416 — Invalid range (stream only)

```bash
curl -s -D - "http://localhost:8000/api/v1/videos/${VIDEO_ID}/stream" \
  -H "Range: bytes=999999-1000000"
```

```
HTTP/1.1 416 Range Not Satisfiable
Content-Range: bytes */1048576
```

No JSON body — the client should request a valid byte range.

---

#### Job failure (via GET /job)

Worker failures (corrupted video, exhausted retries) return **HTTP 200** with a failed job — not an error response:

```bash
curl -s "http://localhost:8000/api/v1/videos/${VIDEO_ID}/job"
```

```json
{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "video_id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "status": "failed",
  "progress": 0,
  "error_message": "Cannot decode 'clip.mp4': ffmpeg could not read the file",
  "started_at": "2024-06-01T12:01:00.000Z",
  "finished_at": "2024-06-01T12:01:05.000Z",
  "created_at": "2024-06-01T12:01:00.000Z",
  "updated_at": "2024-06-01T12:01:05.000Z",
  "queue_position": null,
  "active_job_progress": null
}
```

After max retries (`MAX_JOB_RETRIES`), transient failures also appear here:

```json
{
  "status": "failed",
  "error_message": "Failed after 3 attempt(s): model crashed",
  "progress": 0
}
```

---

## Project structure

Summary — full annotated tree in [architecture.md](./architecture.md#project-structure).

```
video-subtitling-tool/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── app/          # routers · services · repositories · adapters · worker
│   ├── alembic/      # DB migrations
│   └── tests/
└── frontend/
    └── src/          # React app · api client · components · hooks
```
