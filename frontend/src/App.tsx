import { useEffect, useRef, useState } from "react";
import {
  CueResponse,
  JobResponse,
  VideoResponse,
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
  const [job, setJob] = useState<JobResponse | null>(null);
  const [cues, setCues] = useState<CueResponse[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [jobDone, setJobDone] = useState(false);

  const playerRef = useRef<VideoPlayerHandle>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => () => stopPolling(), []);

  function startPolling(vid: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const j = await getJob(vid);
        setJob(j);
        if (j.status === "completed") {
          stopPolling();
          const loaded = await listCues(vid);
          setCues(loaded);       // set cues before jobDone so editor mounts with data
          setJobDone(true);
        } else if (j.status === "failed") {
          stopPolling();
          setTranscribeError(j.error_message ?? "Transcription failed");
        }
      } catch {
        // keep polling
      }
    }, 2000);
  }

  async function openVideo(video: VideoResponse) {
    setVideoId(video.id);
    setVideoName(video.original_name);
    setJob(null);
    setCues([]);
    setTranscribeError(null);
    setJobDone(false);
    setCurrentTimeMs(0);
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

  // ─── Render ──────────────────────────────────────────────────────────────

  if (screen === "library") {
    return (
      <div style={rootStyle}>
        <Header />
        <main style={{ maxWidth: 900, margin: "0 auto" }}>
          <UploadZone onUploaded={handleUploaded} />

          <h2 style={{ color: "#aaa", fontSize: "1rem", margin: "2rem 0 0.75rem" }}>
            Previous videos
          </h2>

          {loadingLibrary ? (
            <p style={{ color: "#555" }}>Loading…</p>
          ) : videos.length === 0 ? (
            <p style={{ color: "#444" }}>No videos yet — upload one above.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {videos.map((v) => (
                <VideoCard key={v.id} video={v} onClick={() => openVideo(v)} />
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

          {/* Queued */}
          {job?.status === "queued" && (
            <StatusBadge color="#6c63ff" label="Queued — waiting for worker…" />
          )}

          {/* Processing */}
          {job?.status === "processing" && (
            <div>
              <ProgressBar value={job.progress} />
              <p style={{ color: "#aaa", marginTop: "0.4rem", fontSize: "0.85rem" }}>
                Transcribing… {job.progress}%
              </p>
            </div>
          )}

          {/* Completed */}
          {job?.status === "completed" && jobDone && (
            <StatusBadge color="#2d8a4e" label="✓ Transcription complete" />
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
}: {
  video: VideoResponse;
  onClick: () => void;
}) {
  const date = new Date(video.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "1rem",
        background: "#111",
        border: "1px solid #222",
        borderRadius: 8,
        padding: "0.75rem 1rem",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.borderColor = "#6c63ff")
      }
      onMouseLeave={(e) =>
        ((e.currentTarget as HTMLButtonElement).style.borderColor = "#222")
      }
    >
      <span style={{ fontSize: "1.5rem" }}>🎬</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, color: "#ddd", fontWeight: 500, fontSize: "0.95rem" }}>
          {video.original_name}
        </p>
        <p style={{ margin: 0, color: "#555", fontSize: "0.75rem" }}>
          {(video.size_bytes / 1024 / 1024).toFixed(1)} MB · {date}
        </p>
      </div>
      <span style={{ color: "#444", fontSize: "0.8rem" }}>Open →</span>
    </button>
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
