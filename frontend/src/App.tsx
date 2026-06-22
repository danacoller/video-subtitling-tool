import { useRef, useState } from "react";
import { VideoResponse, getVideo } from "./api/client";
import { ExportButton } from "./components/ExportButton";
import { JobsMonitor } from "./components/JobsMonitor";
import { SubtitleEditor } from "./components/SubtitleEditor";
import { UploadZone } from "./components/UploadZone";
import { VideoPlayer, VideoPlayerHandle } from "./components/VideoPlayer";
import { Header } from "./components/shared/Header";
import { ProgressBar } from "./components/shared/ProgressBar";
import { StatusBadge } from "./components/shared/StatusBadge";
import { TranscriptionStats } from "./components/shared/TranscriptionStats";
import { VideoCard } from "./components/shared/VideoCard";
import { useEditorSession } from "./hooks/useEditorSession";
import { useLibrary } from "./hooks/useLibrary";
import { BTN, COLORS, ROOT_STYLE } from "./styles/theme";
import { formatDuration } from "./utils/format";

type Screen = "library" | "editor" | "jobs";

export default function App() {
  const [screen, setScreen] = useState<Screen>("library");
  const playerRef = useRef<VideoPlayerHandle>(null);

  const library = useLibrary();
  const editor = useEditorSession();

  function handleUploaded(video: VideoResponse) {
    library.prepend(video);
    openVideo(video);
  }

  async function openVideo(video: VideoResponse) {
    await editor.openVideo(video);
    setScreen("editor");
  }

  function goToLibrary() {
    editor.stopPolling();
    setScreen("library");
    library.load();
  }

  async function handleDeleteAll() {
    if (!window.confirm("Delete all videos? This cannot be undone.")) return;
    await library.removeAll();
  }

  // ── Jobs screen ──────────────────────────────────────────────────────────
  if (screen === "jobs") {
    return (
      <div style={ROOT_STYLE}>
        <Header activeScreen="jobs" onNav={setScreen} />
        <main style={{ maxWidth: 900, margin: "0 auto" }}>
          <h2 style={{ color: "#aaa", fontSize: "1rem", margin: "0 0 1.25rem" }}>
            Transcription Jobs
          </h2>
          <JobsMonitor
            onOpenVideo={async (videoId) => {
              let v = library.videos.find((v) => v.id === videoId);
              if (!v) v = await getVideo(videoId);
              openVideo(v);
            }}
          />
        </main>
      </div>
    );
  }

  // ── Library screen ───────────────────────────────────────────────────────
  if (screen === "library") {
    return (
      <div style={ROOT_STYLE}>
        <Header activeScreen="library" onNav={setScreen} />
        <main style={{ maxWidth: 860, margin: "0 auto", padding: "0 1.5rem 3rem" }}>

          <section style={{ marginBottom: "2.5rem" }}>
            <UploadZone onUploaded={handleUploaded} />
          </section>

          <div style={{ borderTop: "1px solid #18182a", marginBottom: "2rem" }} />

          <section>
            <div style={{ display: "flex", alignItems: "center", marginBottom: "1rem", gap: "0.75rem" }}>
              <span style={{ color: "#3a3a5a", fontSize: "0.8rem", fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", flex: 1 }}>
                {library.loading
                  ? "Loading…"
                  : library.videos.length === 0
                  ? "No videos yet"
                  : `${library.videos.length} video${library.videos.length !== 1 ? "s" : ""}`}
              </span>
              {library.videos.length > 0 && (
                <button onClick={handleDeleteAll} style={BTN.deleteAll}>
                  Delete all
                </button>
              )}
            </div>

            {library.loading ? (
              <SkeletonList />
            ) : library.videos.length === 0 ? (
              <EmptyLibrary />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {library.videos.map((v) => (
                  <VideoCard
                    key={v.id}
                    video={v}
                    onClick={() => openVideo(v)}
                    onDelete={() => library.remove(v.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    );
  }

  // ── Editor screen ────────────────────────────────────────────────────────
  const { videoId, videoName, videoDuration, job, cues, currentTimeMs, transcribeError, jobDone, elapsedSec } = editor;

  return (
    <div style={ROOT_STYLE}>
      <Header activeScreen="editor" onNav={setScreen}>
        <button onClick={goToLibrary} style={BTN.back}>
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
            onTimeUpdate={editor.setCurrentTimeMs}
          />
        )}

        <div style={{ marginTop: "1.25rem" }}>
          {!job && !transcribeError && !jobDone && (
            <button onClick={editor.handleTranscribe} style={BTN.primary}>
              Generate captions
            </button>
          )}

          {!job && !transcribeError && jobDone && (
            <button
              onClick={editor.handleTranscribe}
              style={{ ...BTN.primary, background: "#333", fontSize: "0.8rem", padding: "0.35rem 0.9rem" }}
            >
              Re-transcribe
            </button>
          )}

          {job?.status === "processing" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.4rem" }}>
                <ProgressBar value={job.progress} />
                <span style={{ color: COLORS.brand, fontSize: "0.85rem", fontVariantNumeric: "tabular-nums" }}>
                  {job.progress}%
                </span>
              </div>
              <StatLine label="Status" value="Transcribing…" />
              <StatLine label="Elapsed" value={formatDuration(elapsedSec)} highlight />
              {job.started_at && (
                <StatLine label="Started at" value={new Date(job.started_at).toLocaleTimeString()} />
              )}
            </div>
          )}

          {job?.status === "queued" && (
            <div>
              {job.active_job_progress !== null ? (
                <div
                  style={{
                    background: "#0d0d2e",
                    border: `1px solid ${COLORS.brand}44`,
                    borderRadius: 8,
                    padding: "0.75rem 1rem",
                  }}
                >
                  <p style={{ margin: "0 0 0.5rem", color: COLORS.brand, fontSize: "0.9rem" }}>
                    ⏳ Waiting — another video is transcribing first
                    {job.queue_position && job.queue_position > 1
                      ? ` (${job.queue_position - 1} more ahead of yours)`
                      : ""}
                  </p>
                  <p style={{ margin: "0 0 0.35rem", color: "#555", fontSize: "0.75rem" }}>
                    Current transcription: {job.active_job_progress}%
                  </p>
                  <ProgressBar value={job.active_job_progress} />
                  <p style={{ margin: "0.5rem 0 0", color: "#444", fontSize: "0.72rem" }}>
                    Yours will start automatically when the worker is free.
                  </p>
                </div>
              ) : (
                <StatusBadge color={COLORS.brand} label="Queued — starting in a moment…" />
              )}
            </div>
          )}

          {jobDone && !job && (
            <TranscriptionStats job={null} cueCount={cues.length} videoDuration={videoDuration} />
          )}
          {job?.status === "completed" && jobDone && (
            <TranscriptionStats job={job} cueCount={cues.length} videoDuration={videoDuration} />
          )}

          {(job?.status === "failed" || transcribeError) && (
            <div
              style={{
                background: COLORS.errorBg,
                border: `1px solid ${COLORS.error}`,
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
              <button onClick={editor.handleRetry} style={BTN.retry}>
                Retry
              </button>
            </div>
          )}
        </div>

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
              <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#aaa" }}>Subtitle Editor</h2>
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

// ── Small inline components ──────────────────────────────────────────────────

function StatLine({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", fontSize: "0.8rem", marginTop: "0.2rem" }}>
      <span style={{ color: "#444", minWidth: 110 }}>{label}:</span>
      <span style={{ color: highlight ? COLORS.brand : "#888", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}

function SkeletonList() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      {[0.8, 0.6, 0.4].map((opacity, i) => (
        <div
          key={i}
          style={{
            height: 64,
            background: "#0f0f1a",
            borderRadius: 8,
            border: "1px solid #1a1a2a",
            opacity,
          }}
        />
      ))}
    </div>
  );
}

function EmptyLibrary() {
  return (
    <div
      style={{
        padding: "2.5rem",
        textAlign: "center",
        border: "1px dashed #1e1e2e",
        borderRadius: 12,
        color: "#333",
      }}
    >
      <p style={{ margin: "0 0 0.35rem", fontSize: "2rem" }}>🎬</p>
      <p style={{ margin: 0, fontSize: "0.9rem" }}>Your uploaded videos will appear here</p>
    </div>
  );
}

