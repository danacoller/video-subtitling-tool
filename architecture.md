# Architecture

System design reference — flows, diagrams, and project structure.

For setup, testing, and API usage see [README.md](./README.md).

---

## Table of contents

1. [Overview](#overview)
2. [System flow](#system-flow)
3. [API flow](#api-flow)
4. [User journey flow](#user-journey-flow)
5. [Backend internal flow](#backend-internal-flow)
6. [Worker flow](#worker-flow)
7. [Project structure](#project-structure)
8. [Database schema](#database-schema)

---

## Overview

| Step | Action | Technology |
|------|--------|------------|
| 1 | Upload a video | React dropzone → FastAPI multipart upload |
| 2 | Transcribe speech | Background worker → ffmpeg + faster-whisper |
| 3 | Edit subtitle cues | Browser editor synced to `<video>` playback |
| 4 | Export subtitles | WebVTT download |

Supported formats: MP4, MOV, AVI, MKV, WebM.

**Backend layers:** `routers → services → repositories → adapters`

| Layer | Role |
|-------|------|
| Routers | HTTP routing, Pydantic request/response mapping |
| Services | Business rules — validation, job enqueue, cue CRUD |
| Repositories | Async SQLAlchemy queries |
| Adapters | Filesystem, ffprobe, Whisper (external I/O) |
| Domain | Pure helpers — VTT format, timestamps, validation |

---

## System flow

How the four Docker services connect and where data lives.

```mermaid
flowchart TB
    subgraph Client["Browser"]
        UI["React SPA\n(library · editor · jobs)"]
    end

    subgraph Frontend["frontend :3000"]
        NGINX["nginx\nSPA + /api proxy"]
    end

    subgraph API["api :8000"]
        FASTAPI["FastAPI / uvicorn"]
        ROUTERS["routers\nvideos · subtitles · jobs"]
        SERVICES["services"]
        REPOS["repositories"]
    end

    subgraph WorkerSvc["worker"]
        POLL["poll loop"]
        FFMPEG["ffmpeg\naudio extract"]
        WHISPER["faster-whisper\ntranscribe"]
    end

    subgraph Storage["Persistent storage"]
        PG[("PostgreSQL 16\nvideos · jobs · subtitles")]
        VOL[("video_uploads volume\nuploaded files")]
    end

    UI -->|"HTTP :3000"| NGINX
    NGINX -->|"/api/* → api:8000"| FASTAPI
    UI -->|"dev: Vite proxy /api"| FASTAPI

    FASTAPI --> ROUTERS --> SERVICES --> REPOS
    REPOS --> PG
    SERVICES -->|"read/write files"| VOL

    POLL -->|"claim queued job"| PG
    POLL --> FFMPEG --> WHISPER
    WHISPER -->|"bulk_replace subtitles"| PG
    FFMPEG -->|"read video"| VOL

    ROUTERS -->|"stream video\nRange requests"| VOL
```

| Service | Port | Role |
|---------|------|------|
| frontend | 3000 | React SPA, proxies `/api/` to API |
| api | 8000 | REST API + OpenAPI docs |
| worker | — | Background transcription |
| db | internal | PostgreSQL 16 |

---

## API flow

All REST endpoints grouped by resource, with typical call order.

```mermaid
flowchart LR
    subgraph Health
        H["GET /health"]
    end

    subgraph Videos["/api/v1/videos"]
        V_LIST["GET /videos\nlist all"]
        V_POST["POST /videos\nupload file"]
        V_GET["GET /videos/{id}\nmetadata"]
        V_DEL["DELETE /videos/{id}"]
        V_DEL_ALL["DELETE /videos"]
        V_STREAM["GET /videos/{id}/stream\nHTTP Range"]
    end

    subgraph Jobs["/api/v1/jobs & transcribe"]
        J_LIST["GET /jobs\nall jobs + video info"]
        J_POST["POST /videos/{id}/transcribe\nenqueue job → 202"]
        J_GET["GET /videos/{id}/job\nstatus + progress"]
    end

    subgraph Subtitles["/api/v1/subtitles"]
        S_LIST["GET /videos/{id}/subtitles\nlist cues"]
        S_POST["POST /videos/{id}/subtitles\nadd cue"]
        S_PATCH["PATCH /subtitles/{id}\nupdate cue"]
        S_DEL["DELETE /subtitles/{id}"]
        S_PUT["PUT /videos/{id}/subtitles\nbulk replace"]
        S_VTT["GET /videos/{id}/subtitles.vtt\nexport WebVTT"]
    end

    V_POST -->|"creates Video row"| V_GET
    V_POST --> V_STREAM
    V_GET --> J_POST
    J_POST -->|"worker processes"| J_GET
    J_GET -->|"completed"| S_LIST
    S_LIST --> S_PUT
    S_PUT --> S_VTT
    J_POST -.-> J_LIST
```

### Happy-path sequence

```mermaid
sequenceDiagram
    participant B as Browser
    participant F as Frontend / nginx
    participant A as API
    participant W as Worker
    participant D as PostgreSQL
    participant S as File storage

    B->>F: POST /api/v1/videos (multipart)
    F->>A: proxy upload
    A->>S: save video file
    A->>D: INSERT video
    A-->>B: 201 VideoResponse

    B->>F: POST /api/v1/videos/{id}/transcribe
    F->>A: enqueue job
    A->>D: INSERT job (queued)
    A-->>B: 202 JobResponse

    loop poll every ~2s
        B->>F: GET /api/v1/videos/{id}/job
        F->>A: job status
        A->>D: SELECT job
        A-->>B: progress 0→100%
    end

    W->>D: claim queued job
    W->>S: read video
    W->>W: ffmpeg → WAV → Whisper
    W->>D: INSERT subtitles + mark completed

    B->>F: GET /api/v1/videos/{id}/subtitles
    F->>A: list cues
    A-->>B: CueResponse[]

    B->>F: PUT /api/v1/videos/{id}/subtitles
    F->>A: bulk replace
    A->>D: REPLACE cues
    A-->>B: updated cues

    B->>F: GET /api/v1/videos/{id}/subtitles.vtt
    F->>A: export
    A-->>B: WebVTT file
```

---

## User journey flow

How the three frontend screens map to API calls.

```mermaid
flowchart TD
    START([Open app]) --> LIB[Library screen]

    LIB --> UP["UploadZone\nPOST /videos"]
    UP --> LIB
    LIB --> OPEN["Click video\nGET /videos/{id}"]

    OPEN --> ED[Editor screen]
    ED --> PLAY["VideoPlayer\nGET /videos/{id}/stream"]
    ED --> TRANS["Transcribe button\nPOST /videos/{id}/transcribe"]
    TRANS --> POLL["Poll job\nGET /videos/{id}/job"]
    POLL -->|"completed"| LOAD["Load cues\nGET /videos/{id}/subtitles"]
    LOAD --> EDIT["SubtitleEditor\nedit cues"]
    EDIT --> SAVE["Save\nPUT /videos/{id}/subtitles"]
    SAVE --> EXPORT["ExportButton\nGET /subtitles.vtt"]

    LIB --> JOBS_NAV[Jobs screen]
    JOBS_NAV --> JMON["JobsMonitor\nGET /jobs every 1s"]
    JMON -->|"click row"| ED

    LIB --> DEL["Delete video\nDELETE /videos/{id}"]
    DEL --> LIB
```

---

## Backend internal flow

Request path through the Python layers.

```mermaid
flowchart TD
    REQ["HTTP request"] --> ROUTER

    subgraph ROUTER["routers/"]
        RV[videos.py]
        RS[subtitles.py]
        RJ[jobs.py]
    end

    subgraph SERVICE["services/"]
        VS[VideoService]
        SS[SubtitleService]
        TS[TranscriptionService]
        JS[JobService]
    end

    subgraph REPO["repositories/"]
        VR[VideoRepository]
        SR[SubtitleRepository]
        JR[JobRepository]
    end

    subgraph ADAPT["adapters/"]
        ST[LocalStorageAdapter]
        MP[media_probe]
        TW[FasterWhisperTranscriber]
    end

    subgraph DOMAIN["domain/"]
        VTT[vtt.py]
        TS2[timestamps.py]
        VAL[validation.py]
    end

    RV --> VS --> VR
    VS --> ST
    VS --> MP

    RS --> SS --> SR
    SS --> VTT
    SS --> VAL

    RJ --> TS --> JR
    RJ --> JS --> JR
    TS --> VR

    VR --> DB[("PostgreSQL")]
    SR --> DB
    JR --> DB
    ST --> FS[("File system")]

    WORKER["worker.py"] --> JR
    WORKER --> VR
    WORKER --> SR
    WORKER --> ST
    WORKER --> TW
```

---

## Worker flow

Background transcription pipeline.

```mermaid
flowchart TD
    START([Worker starts]) --> RESET["reset_orphaned\nprocessing → queued"]
    RESET --> POLL{"claim_queued\noldest job?"}

    POLL -->|"none"| SLEEP["sleep WORKER_POLL_INTERVAL"]
    SLEEP --> POLL

    POLL -->|"claimed"| LOAD["load video metadata"]
    LOAD --> PROBE["probe duration\nif missing"]
    PROBE --> EXTRACT["ffmpeg: video → mono 16kHz WAV"]

    EXTRACT -->|"CorruptedVideoError"| FAIL1["mark_failed\nno retry"]
    EXTRACT -->|"ok"| WHISPER["faster-whisper\ntranscribe segments"]

    WHISPER --> PROGRESS["update progress\nevery 1 second"]
    PROGRESS --> BULK["bulk_replace subtitles"]
    BULK --> DONE["mark_completed\nprogress = 100"]

    WHISPER -->|"transient error"| RETRY{"retries left?"}
    RETRY -->|"yes"| REQUEUE["requeue_for_retry"]
    RETRY -->|"no"| FAIL2["mark_failed"]
    REQUEUE --> POLL
    FAIL1 --> POLL
    FAIL2 --> POLL
    DONE --> POLL
```

Job `status` lifecycle: `queued` → `processing` → `completed` | `failed`

Corrupted files fail immediately (no retry). Transient errors requeue up to `MAX_JOB_RETRIES`.

---

## Project structure

Complete file tree. Paths relative to `video-subtitling-tool/`.

```
video-subtitling-tool/
│
├── .env.example                 # Environment template
├── docker-compose.yml           # db · api · worker · frontend · test services
├── README.md                    # Setup, testing, API usage
├── architecture.md              # This file
├── PROMPT.md                    # Original project prompt / spec
│
├── test-videos/                 # Manual test fixtures
│   └── corrupted_test.mp4       # Optional ffmpeg corruption test fixture
│
├── backend/
│   ├── Dockerfile               # Multi-stage Python 3.12 image (ffmpeg included)
│   ├── pyproject.toml           # Package metadata, dev deps, tool config
│   ├── requirements.txt         # Runtime deps for Docker image
│   ├── conftest.py              # Adds backend/ to sys.path for pytest
│   ├── alembic.ini              # Alembic configuration
│   │
│   ├── alembic/
│   │   ├── env.py               # Async migration runner
│   │   └── versions/
│   │       ├── 0001_initial.py          # videos, transcription_jobs, subtitles
│   │       └── 0002_add_retry_count.py  # retry_count on jobs
│   │
│   ├── app/
│   │   ├── main.py              # FastAPI app factory, CORS, error handlers
│   │   ├── config.py            # Pydantic settings
│   │   ├── db.py                # Async SQLAlchemy engine, session, Base
│   │   ├── models.py            # ORM: Video, TranscriptionJob, Subtitle
│   │   ├── errors.py            # AppError hierarchy
│   │   ├── worker.py            # Background transcription worker
│   │   │
│   │   ├── routers/
│   │   │   ├── videos.py        # CRUD, upload, HTTP Range streaming
│   │   │   ├── subtitles.py     # CRUD cues, bulk replace, VTT export
│   │   │   └── jobs.py          # Transcribe enqueue, job status, list jobs
│   │   │
│   │   ├── services/
│   │   │   ├── video_service.py
│   │   │   ├── subtitle_service.py
│   │   │   ├── transcription_service.py
│   │   │   └── job_service.py
│   │   │
│   │   ├── repositories/
│   │   │   ├── video_repo.py
│   │   │   ├── subtitle_repo.py
│   │   │   ├── job_repo.py            # Atomic claim_queued, progress updates
│   │   │   └── fakes.py               # In-memory fakes for unit tests
│   │   │
│   │   ├── adapters/
│   │   │   ├── storage.py             # LocalStorageAdapter
│   │   │   ├── media_probe.py         # ffprobe duration detection
│   │   │   └── transcription.py       # FasterWhisperTranscriber
│   │   │
│   │   ├── domain/
│   │   │   ├── vtt.py                 # WebVTT serialization
│   │   │   ├── timestamps.py          # ms ↔ VTT timestamp conversion
│   │   │   └── validation.py          # Cue overlap / ordering rules
│   │   │
│   │   └── schemas/
│   │       ├── video_schemas.py
│   │       ├── subtitle_schemas.py
│   │       └── job_schemas.py
│   │
│   └── tests/
│       ├── integration/
│       │   ├── test_upload_api.py
│       │   ├── test_subtitle_api.py
│       │   └── test_e2e.py
│       └── unit/
│           ├── test_corrupted_file.py
│           ├── test_repositories.py
│           ├── test_subtitle_service.py
│           ├── test_timestamps.py
│           ├── test_transcription_service.py
│           ├── test_validation.py
│           ├── test_video_service.py
│           ├── test_vtt.py
│           └── test_worker.py
│
└── frontend/
    ├── Dockerfile               # builder (Node 20) → runtime (nginx)
    ├── nginx.conf               # SPA fallback + /api/ proxy
    ├── index.html
    ├── package.json
    ├── vite.config.ts           # Dev server, /api proxy, Vitest config
    │
    └── src/
        ├── main.tsx
        ├── App.tsx              # library · editor · jobs screens
        ├── api/client.ts        # Axios client + TypeScript types
        ├── hooks/
        │   ├── useLibrary.ts
        │   └── useEditorSession.ts
        ├── components/
        │   ├── UploadZone.tsx
        │   ├── VideoPlayer.tsx
        │   ├── SubtitleEditor.tsx
        │   ├── CueRow.tsx
        │   ├── ExportButton.tsx
        │   ├── JobsMonitor.tsx
        │   └── shared/          # Header, VideoCard, ProgressBar, …
        ├── styles/theme.ts
        └── utils/format.ts
```

---

## Database schema

```mermaid
erDiagram
    videos ||--o{ transcription_jobs : has
    videos ||--o{ subtitles : has

    videos {
        uuid id PK
        string original_name
        string content_type
        bigint size_bytes
        float duration_seconds
        string storage_path UK
        string status
        datetime created_at
        datetime updated_at
    }

    transcription_jobs {
        uuid id PK
        uuid video_id FK
        string status
        int progress
        int retry_count
        text error_message
        datetime started_at
        datetime finished_at
        datetime created_at
        datetime updated_at
    }

    subtitles {
        uuid id PK
        uuid video_id FK
        int start_ms
        int end_ms
        text text
        int position
        datetime created_at
        datetime updated_at
    }
```
