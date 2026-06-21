import { useEffect, useRef, useState } from "react";
import { CueResponse, JobResponse, getJob, listCues, transcribeVideo } from "./api/client";
import { ExportButton } from "./components/ExportButton";
import { SubtitleEditor } from "./components/SubtitleEditor";
import { UploadZone } from "./components/UploadZone";
import { VideoPlayer, VideoPlayerHandle } from "./components/VideoPlayer";

type Step = "upload" | "transcribe" | "edit";

export default function App() {
  const [step, setStep] = useState<Step>("upload");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [job, setJob] = useState<JobResponse | null>(null);
  const [cues, setCues] = useState<CueResponse[]>([]);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const playerRef = useRef<VideoPlayerHandle>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function handleUploaded(id: string) {
    setVideoId(id);
    setStep("transcribe");
  }

  async function handleTranscribe() {
    if (!videoId) return;
    setTranscribeError(null);
    try {
      const j = await transcribeVideo(videoId);
      setJob(j);
      startPolling(videoId);
    } catch (err: unknown) {
      setTranscribeError(err instanceof Error ? err.message : "Failed to start transcription");
    }
  }

  function startPolling(vid: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const j = await getJob(vid);
        setJob(j);
        if (j.status === "completed") {
          clearInterval(pollRef.current!);
          const loadedCues = await listCues(vid);
          setCues(loadedCues);
          setStep("edit");
        } else if (j.status === "failed") {
          clearInterval(pollRef.current!);
          setTranscribeError(j.error_message ?? "Transcription failed");
        }
      } catch {
        // silent — keep polling
      }
    }, 2000);
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function handleSeek(ms: number) {
    playerRef.current?.seekTo(ms);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0a0a14",
        color: "#e0e0e0",
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        padding: "2rem",
        boxSizing: "border-box",
      }}
    >
      <header style={{ marginBottom: "2rem", textAlign: "center" }}>
        <h1 style={{ color: "#6c63ff", margin: 0, fontSize: "2rem" }}>
          Video Subtitling Tool
        </h1>
        <p style={{ color: "#666", marginTop: "0.5rem" }}>
          Upload → Generate → Edit → Export
        </p>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Step indicator */}
        <div
          style={{
            display: "flex",
            gap: "1rem",
            marginBottom: "2rem",
            justifyContent: "center",
          }}
        >
          {(["upload", "transcribe", "edit"] as Step[]).map((s) => (
            <div
              key={s}
              style={{
                padding: "0.4rem 1rem",
                borderRadius: 20,
                fontSize: "0.85rem",
                background: step === s ? "#6c63ff" : "#1a1a2e",
                color: step === s ? "#fff" : "#555",
                fontWeight: step === s ? 600 : 400,
              }}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </div>
          ))}
        </div>

        {/* Upload step */}
        {step === "upload" && <UploadZone onUploaded={handleUploaded} />}

        {/* Transcribe step */}
        {step === "transcribe" && videoId && (
          <div>
            <VideoPlayer
              ref={playerRef}
              videoId={videoId}
              onTimeUpdate={setCurrentTimeMs}
            />

            <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
              {!job || job.status === "queued" || job.status === "failed" ? (
                <>
                  <button
                    onClick={handleTranscribe}
                    style={primaryBtn}
                    disabled={job?.status === "queued"}
                  >
                    {job?.status === "queued" ? "Queued…" : "Generate captions"}
                  </button>
                  {transcribeError && (
                    <p style={{ color: "#f44", marginTop: "0.5rem" }}>
                      {transcribeError}
                    </p>
                  )}
                </>
              ) : job.status === "processing" ? (
                <div>
                  <div
                    style={{
                      background: "#222",
                      borderRadius: 6,
                      height: 8,
                      overflow: "hidden",
                      maxWidth: 400,
                      margin: "0 auto",
                    }}
                  >
                    <div
                      style={{
                        width: `${job.progress}%`,
                        background: "#6c63ff",
                        height: "100%",
                        transition: "width 0.3s",
                      }}
                    />
                  </div>
                  <p style={{ color: "#aaa", marginTop: "0.5rem" }}>
                    Transcribing… {job.progress}%
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Edit step */}
        {step === "edit" && videoId && (
          <div>
            <VideoPlayer
              ref={playerRef}
              videoId={videoId}
              onTimeUpdate={setCurrentTimeMs}
            />

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: "1.5rem",
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
              onSeek={handleSeek}
            />
          </div>
        )}
      </main>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: "#6c63ff",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
  padding: "0.6rem 1.5rem",
  fontSize: "1rem",
};
