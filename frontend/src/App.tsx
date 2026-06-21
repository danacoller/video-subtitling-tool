import { useEffect, useRef, useState } from "react";
import {
  CueResponse,
  JobResponse,
  VideoResponse,
  deleteAllVideos,
  deleteVideo,
  getJob,
  listCues,
  listVideos,
  transcribeVideo,
} from "./api/client";
import { ExportButton } from "./components/ExportButton";
import { SubtitleEditor } from "./components/SubtitleEditor";
import { UploadZone } from "./components/UploadZone";
import { VideoPlayer, VideoPlayerHandle } from "./components/VideoPlayer";

type Screen = "library" | "editor";

export default function App() {
  const [screen, setScreen] = useState<Screen>("library");
  const [videos, setVideos] = useState<VideoResponse[]>([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);

  // Active video session
  const [videoId, setVideoId] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>("");
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [cues, setCues] = useState<CueResponse[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [jobDone, setJobDone] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const playerRef = useRef<VideoPlayerHandle>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load video library on mount and when returning to library screen
  async function loadLibrary() {
    setLoadingLibrary(true);
    try {
      const list = await listVideos();
      setVideos(list);
    } finally {
      setLoadingLibrary(false);
    }
  }

  useEffect(() => {
    loadLibrary();
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function startTimer(startedAt: string | null) {
    stopTimer();
    const origin = startedAt ? new Date(startedAt).getTime() : Date.now();
    setElapsedSec(Math.floor((Date.now() - origin) / 1000));
    timerRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - origin) / 1000));
    }, 1000);
  }

  useEffect(() => () => { stopPolling(); stopTimer(); }, []);

  function startPolling(vid: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const j = await getJob(vid);
        setJob(j);
        if (j.status === "processing" && timerRef.current === null) {
          startTimer(j.started_at);
        }
        if (j.status === "completed") {
          stopPolling();
          stopTimer();
          const loaded = await listCues(vid);
          setCues(loaded);
          setJobDone(true);
        } else if (j.status === "failed") {
          stopPolling();
          stopTimer();
          setTranscribeError(j.error_message ?? "Transcription failed");
        }
      } catch {
        // keep polling
      }
    }, 1000);
  }

  async function openVideo(video: VideoResponse) {
    setVideoId(video.id);
    setVideoName(video.original_name);
    setVideoDuration(video.duration_seconds);
    setJob(null);
    setCues([]);
    setTranscribeError(null);
    setJobDone(false);
    setCurrentTimeMs(0);
    setElapsedSec(0);
    stopTimer();
    setScreen("editor");

    // Load existing cues — if any exist, open editor directly, no job check needed
    const existingCues = await listCues(video.id).catch(() => []);
    if (existingCues.length > 0) {
      setCues(existingCues);
      setJobDone(true);
      return;
    }

    // No cues yet — check if transcription is currently in progress
    try {
      const j = await getJob(video.id);
      setJob(j);
      if (j.status === "queued" || j.status === "processing") {
        startPolling(video.id);
      }
    } catch {
      // No job either — fresh video, user can click "Generate captions"
    }
  }

  function handleUploaded(video: VideoResponse) {
    setVideos((prev) => [video, ...prev]);
    openVideo(video);
  }

  async function handleTranscribe() {
    if (!videoId) return;
    setTranscribeError(null);
    setJobDone(false);
    setJob(null);
    try {
      const j = await transcribeVideo(videoId);
      setJob(j);
      startPolling(videoId);
    } catch (err: unknown) {
      setTranscribeError(
        err instanceof Error ? err.message : "Failed to start transcription"
      );
    }
  }

  function handleRetry() {
    setTranscribeError(null);
    setJob(null);
    handleTranscribe();
  }

  function goToLibrary() {
    stopPolling();
    setScreen("library");
    loadLibrary();
  }

  async function handleDeleteVideo(id: string) {
    await deleteVideo(id);
    setVideos((prev) => prev.filter((v) => v.id !== id));
  }

  async function handleDeleteAll() {
    if (!window.confirm("Delete all videos? This cannot be undone.")) return;
    await deleteAllVideos();
    setVideos([]);
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  if (screen === "library") {
    return (
      <div style={rootStyle}>
        <Header />
        <main style={{ maxWidth: 900, margin: "0 auto" }}>
          <UploadZone onUploaded={handleUploaded} />

          <div
            style={{
              display: "flex",
              alignItems: "center",
              margin: "2rem 0 0.75rem",
              gap: "1rem",
            }}
          >
            <h2 style={{ color: "#aaa", fontSize: "1rem", margin: 0, flex: 1 }}>
              Previous videos
            </h2>
            {videos.length > 0 && (
              <button onClick={handleDeleteAll} style={deleteAllBtn}>
                Delete all
              </button>
            )}
          </div>

          {loadingLibrary ? (
            <p style={{ color: "#555" }}>Loading…</p>
          ) : videos.length === 0 ? (
            <p style={{ color: "#444" }}>No videos yet — upload one above.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {videos.map((v) => (
                <VideoCard
                  key={v.id}
                  video={v}
                  onClick={() => openVideo(v)}
                  onDelete={() => handleDeleteVideo(v.id)}
                />
              ))}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ─── Editor screen ────────────────────────────────────────────────────────
  return (
    <div style={rootStyle}>
      <Header>
        <button onClick={goToLibrary} style={backBtn}>
          ← My Videos
        </button>
      </Header>

      <main style={{ maxWidth: 900, margin: "0 auto" }}>
        <p style={{ color: "#666", fontSize: "0.85rem", marginBottom: "1rem" }}>
          {videoName}
        </p>

        {videoId && (
          <VideoPlayer
            ref={playerRef}
            videoId={videoId}
            onTimeUpdate={setCurrentTimeMs}
          />
        )}

        {/* ── Job status panel ── */}
        <div style={{ marginTop: "1.25rem" }}>
          {/* No job yet and no cues — show generate button */}
          {!job && !transcribeError && !jobDone && (
            <button onClick={handleTranscribe} style={primaryBtn}>
              Generate captions
            </button>
          )}

          {/* Has cues but no active job — offer re-transcription */}
          {!job && !transcribeError && jobDone && (
            <button onClick={handleTranscribe} style={{ ...primaryBtn, background: "#333", fontSize: "0.8rem", padding: "0.35rem 0.9rem" }}>
              Re-transcribe
            </button>
          )}

          {/* Processing */}
          {job?.status === "processing" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.4rem" }}>
                <ProgressBar value={job.progress} />
                <span style={{ color: "#6c63ff", fontSize: "0.85rem", fontVariantNumeric: "tabular-nums" }}>
                  {job.progress}%
                </span>
              </div>
              <DebugLine label="Status" value="Transcribing…" />
              <DebugLine label="Elapsed" value={formatDuration(elapsedSec)} highlight />
              {job.started_at && (
                <DebugLine label="Started at" value={new Date(job.started_at).toLocaleTimeString()} />
              )}
            </div>
          )}

          {/* Queued */}
          {job?.status === "queued" && (
            <StatusBadge
              color="#6c63ff"
              label={
                job.queue_position && job.queue_position > 1
                  ? `Queued — position ${job.queue_position} (${job.queue_position - 1} job${job.queue_position > 2 ? "s" : ""} ahead)`
                  : "Queued — next up, waiting for worker…"
              }
            />
          )}

          {/* Stats panel — shown once subtitles are ready */}
          {jobDone && !job && (
            <DebugPanel job={null} cueCount={cues.length} videoDuration={videoDuration} />
          )}
          {job?.status === "completed" && jobDone && (
            <DebugPanel job={job} cueCount={cues.length} videoDuration={videoDuration} />
          )}

          {/* Failed */}
          {(job?.status === "failed" || transcribeError) && (
            <div
              style={{
                background: "#2a0a0a",
                border: "1px solid #f44",
                borderRadius: 8,
                padding: "0.75rem 1rem",
                display: "flex",
                alignItems: "center",
                gap: "1rem",
              }}
            >
              <span style={{ color: "#f66", flex: 1 }}>
                ✗ Failed: {transcribeError ?? job?.error_message ?? "Unknown error"}
              </span>
              <button onClick={handleRetry} style={retryBtn}>
                Retry
              </button>
            </div>
          )}
        </div>

        {/* ── Subtitle editor (shown once completed or after loading existing cues) ── */}
        {jobDone && videoId && (
          <div style={{ marginTop: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
              }}
            >
              <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#aaa" }}>
                Subtitle Editor
              </h2>
              <ExportButton videoId={videoId} />
            </div>

              {cues.length === 0 && (
              <div
                style={{
                  background: "#111",
                  border: "1px solid #2a2a2a",
                  borderRadius: 8,
                  padding: "2rem",
                  textAlign: "center",
                  marginBottom: "1rem",
                }}
              >
                <p style={{ color: "#555", margin: "0 0 0.5rem", fontSize: "1.5rem" }}>🔇</p>
                <p style={{ color: "#666", margin: "0 0 0.5rem", fontSize: "0.95rem" }}>
                  No speech detected in this video.
                </p>
                <p style={{ color: "#444", margin: "0 0 1rem", fontSize: "0.8rem" }}>
                  You can add subtitles manually or re-transcribe if the video should have speech.
                </p>
              </div>
            )}

            <SubtitleEditor
              videoId={videoId}
              initialCues={cues}
              currentTimeMs={currentTimeMs}
              onSeek={(ms) => playerRef.current?.seekTo(ms)}
            />
          </div>
        )}
      </main>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header
      style={{
        borderBottom: "1px solid #1e1e2e",
        padding: "1rem 2rem",
        marginBottom: "2rem",
        display: "flex",
        alignItems: "center",
        gap: "1.5rem",
      }}
    >
      <h1 style={{ color: "#6c63ff", margin: 0, fontSize: "1.5rem", flex: 1 }}>
        Video Subtitling Tool
      </h1>
      {children}
    </header>
  );
}

function VideoCard({
  video,
  onClick,
  onDelete,
}: {
  video: VideoResponse;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const date = new Date(video.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const duration = video.duration_seconds != null
    ? `${Math.floor(video.duration_seconds / 60)}:${String(Math.round(video.duration_seconds % 60)).padStart(2, "0")}`
    : null;

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        background: "#111",
        border: "1px solid #222",
        borderRadius: 8,
        padding: "0.75rem 1rem",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = "#6c63ff")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLDivElement).style.borderColor = "#222")
      }
    >
      {/* Clickable area */}
      <button
        onClick={onClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          flex: 1,
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          padding: 0,
          minWidth: 0,
        }}
      >
        <span style={{ fontSize: "1.5rem" }}>🎬</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, color: "#ddd", fontWeight: 500, fontSize: "0.95rem" }}>
            {video.original_name}
          </p>
          <p style={{ margin: 0, color: "#555", fontSize: "0.75rem" }}>
            {(video.size_bytes / 1024 / 1024).toFixed(1)} MB
            {duration && ` · ${duration}`}
            {` · ${date}`}
          </p>
        </div>
        <span style={{ color: "#444", fontSize: "0.8rem", marginRight: "0.5rem" }}>Open →</span>
      </button>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={deleting}
        title="Delete video"
        style={{
          background: "transparent",
          border: "1px solid #3a1515",
          borderRadius: 6,
          color: deleting ? "#555" : "#c44",
          cursor: deleting ? "not-allowed" : "pointer",
          padding: "0.3rem 0.7rem",
          fontSize: "0.8rem",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
        onMouseEnter={(e) => {
          if (!deleting) (e.currentTarget as HTMLButtonElement).style.background = "#2a0a0a";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background = "transparent";
        }}
      >
        {deleting ? "…" : "Delete"}
      </button>
    </div>
  );
}

function formatDuration(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function DebugLine({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.8rem", marginTop: "0.2rem" }}>
      <span style={{ color: "#444", minWidth: 110 }}>{label}:</span>
      <span style={{ color: highlight ? "#6c63ff" : "#888", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

function DebugPanel({
  job,
  cueCount,
  videoDuration,
}: {
  job: JobResponse | null;
  cueCount: number;
  videoDuration: number | null;
}) {
  const transcribeSec =
    job?.started_at && job?.finished_at
      ? Math.round(
          (new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) / 1000
        )
      : null;

  const speedRatio =
    transcribeSec && videoDuration && transcribeSec > 0
      ? (videoDuration / transcribeSec).toFixed(2)
      : null;

  return (
    <div
      style={{
        background: "#0a0f0a",
        border: "1px solid #1a3a1a",
        borderRadius: 8,
        padding: "0.75rem 1rem",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.5rem" }}>
        <span style={{ color: "#2d8a4e", fontSize: "0.9rem" }}>✓ Subtitles ready</span>
      </div>
      {videoDuration !== null && (
        <DebugLine label="Video duration" value={formatDuration(Math.round(videoDuration))} />
      )}
      <DebugLine label="Segments" value={`${cueCount} subtitle cues`} />
      {job?.started_at && (
        <DebugLine label="Started at" value={new Date(job.started_at).toLocaleTimeString()} />
      )}
      {job?.finished_at && (
        <DebugLine label="Finished at" value={new Date(job.finished_at).toLocaleTimeString()} />
      )}
      {transcribeSec !== null && (
        <DebugLine label="Transcribe time" value={formatDuration(transcribeSec)} highlight />
      )}
      {speedRatio !== null && (
        <DebugLine label="Speed" value={`${speedRatio}× faster than real-time`} highlight />
      )}
      {job?.id && (
        <DebugLine label="Job ID" value={job.id} />
      )}
    </div>
  );
}

function StatusBadge({ color, label }: { color: string; label: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        background: color + "22",
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: "0.4rem 0.9rem",
        color,
        fontSize: "0.9rem",
      }}
    >
      {label}
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div
      style={{
        background: "#222",
        borderRadius: 6,
        height: 8,
        overflow: "hidden",
        maxWidth: 400,
      }}
    >
      <div
        style={{
          width: `${value}%`,
          background: "#6c63ff",
          height: "100%",
          transition: "width 0.3s",
        }}
      />
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const rootStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0a0a14",
  color: "#e0e0e0",
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  boxSizing: "border-box",
};

const primaryBtn: React.CSSProperties = {
  background: "#6c63ff",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
  padding: "0.6rem 1.5rem",
  fontSize: "1rem",
};

const retryBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #f44",
  borderRadius: 6,
  color: "#f66",
  cursor: "pointer",
  padding: "0.35rem 0.9rem",
  fontSize: "0.85rem",
  whiteSpace: "nowrap",
};

const backBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #333",
  borderRadius: 6,
  color: "#888",
  cursor: "pointer",
  padding: "0.35rem 0.9rem",
  fontSize: "0.85rem",
};

const deleteAllBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #3a1515",
  borderRadius: 6,
  color: "#c44",
  cursor: "pointer",
  padding: "0.3rem 0.8rem",
  fontSize: "0.8rem",
};
