import { useEffect, useRef, useState } from "react";
import { JobWithVideo, listAllJobs } from "../api/client";
import { ProgressBar } from "./shared/ProgressBar";
import { formatDuration } from "../utils/format";

interface Props {
  onOpenVideo: (videoId: string) => void | Promise<void>;
}

export function JobsMonitor({ onOpenVideo }: Props) {
  const [jobs, setJobs] = useState<JobWithVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function refresh() {
    try {
      const data = await listAllJobs();
      setJobs(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 1000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const active = jobs.filter((j) => j.status === "processing");
  const queued = jobs.filter((j) => j.status === "queued");
  const failed = jobs.filter((j) => j.status === "failed");
  const completed = jobs.filter((j) => j.status === "completed");

  if (loading) return <p style={{ color: "#555", padding: "1rem" }}>Loading jobs…</p>;
  if (jobs.length === 0)
    return <p style={{ color: "#444", padding: "1rem" }}>No transcription jobs yet.</p>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <style>{`@keyframes jm-pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }`}</style>
      <JobSection title="Running" color="#6c63ff" jobs={active} onOpen={onOpenVideo} />
      <JobSection title="Queued" color="#888" jobs={queued} onOpen={onOpenVideo} />
      <JobSection title="Failed" color="#c44" jobs={failed} onOpen={onOpenVideo} />
      <JobSection title="Completed" color="#2d8a4e" jobs={completed} onOpen={onOpenVideo} />
    </div>
  );
}

function JobSection({
  title,
  color,
  jobs,
  onOpen,
}: {
  title: string;
  color: string;
  jobs: JobWithVideo[];
  onOpen: (videoId: string) => void;
}) {
  if (jobs.length === 0) return null;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: color,
            display: "inline-block",
            flexShrink: 0,
            ...(title === "Running" ? { boxShadow: `0 0 6px ${color}` } : {}),
          }}
        />
        <span style={{ color: "#888", fontSize: "0.8rem", fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {title} ({jobs.length})
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {jobs.map((job) => (
          <JobRow key={job.id} job={job} color={color} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function JobRow({
  job,
  color,
  onOpen,
}: {
  job: JobWithVideo;
  color: string;
  onOpen: (videoId: string) => void;
}) {
  const elapsed =
    job.started_at && job.finished_at
      ? Math.round((new Date(job.finished_at).getTime() - new Date(job.started_at).getTime()) / 1000)
      : job.started_at && !job.finished_at
      ? Math.floor((Date.now() - new Date(job.started_at).getTime()) / 1000)
      : null;

  const duration = job.video_duration
    ? formatDuration(Math.round(job.video_duration))
    : null;

  return (
    <button
      onClick={() => onOpen(job.video_id)}
      title="Open video"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        background: "#111",
        border: `1px solid #1e1e2e`,
        borderRadius: 8,
        padding: "0.6rem 0.85rem",
        cursor: "pointer",
        textAlign: "left",
        width: "100%",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = color)}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "#1e1e2e")}
    >
      {/* Status dot */}
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          flexShrink: 0,
          ...(job.status === "processing" ? { animation: "jm-pulse 1.4s ease-in-out infinite" } : {}),
        }}
      />

      {/* Video name + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, color: "#ddd", fontSize: "0.9rem", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {job.video_name}
        </p>
        <p style={{ margin: 0, color: "#555", fontSize: "0.72rem" }}>
          {duration && `${duration} · `}
          {new Date(job.created_at).toLocaleTimeString()}
          {elapsed !== null && ` · ${formatDuration(elapsed)} elapsed`}
        </p>
      </div>

      {/* Progress / badge */}
      <div style={{ flexShrink: 0, textAlign: "right" }}>
        {job.status === "processing" && (
          <div style={{ minWidth: 120 }}>
            <span style={{ color: color, fontSize: "0.75rem", display: "block", marginBottom: 3 }}>
              {job.progress}%
            </span>
            <ProgressBar value={job.progress} color={color} height={5} maxWidth={120} />
          </div>
        )}
        {job.status === "queued" && (
          <span style={{ color: "#555", fontSize: "0.75rem" }}>Waiting…</span>
        )}
        {job.status === "completed" && (
          <span style={{ color: "#2d8a4e", fontSize: "0.75rem" }}>✓ Done</span>
        )}
        {job.status === "failed" && (
          <span style={{ color: "#c44", fontSize: "0.75rem" }} title={job.error_message ?? ""}>✗ Failed</span>
        )}
      </div>
    </button>
  );
}

