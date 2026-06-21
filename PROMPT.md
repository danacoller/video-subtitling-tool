# Original Prompt

Build a video subtitling tool with the following features:

- Upload video files (mp4, mov, avi, mkv, webm)
- Auto-generate subtitles using Whisper (faster-whisper)
- Edit subtitle cues: add, update, delete, reorder
- Export subtitles as WebVTT (.vtt)
- Stream video back with HTTP range requests
- Background worker processes transcription jobs

Stack: Python 3.12, FastAPI, SQLAlchemy async, PostgreSQL, faster-whisper, ffmpeg, React + TypeScript + Vite.
