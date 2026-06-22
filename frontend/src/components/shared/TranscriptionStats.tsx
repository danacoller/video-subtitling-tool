import { JobResponse } from "../../api/client";
import { formatDuration } from "../../utils/format";

interface Props {
  job: JobResponse | null;
  cueCount: number;
  videoDuration: number | null;
}

export function TranscriptionStats({ job, cueCount, videoDuration }: Props) {
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
        <StatLine label="Video duration" value={formatDuration(Math.round(videoDuration))} />
      )}
      <StatLine label="Segments" value={`${cueCount} subtitle cues`} />
      {job?.started_at && (
        <StatLine label="Started at" value={new Date(job.started_at).toLocaleTimeString()} />
      )}
      {job?.finished_at && (
        <StatLine label="Finished at" value={new Date(job.finished_at).toLocaleTimeString()} />
      )}
      {transcribeSec !== null && (
        <StatLine label="Transcribe time" value={formatDuration(transcribeSec)} highlight />
      )}
      {speedRatio !== null && (
        <StatLine label="Speed" value={`${speedRatio}× faster than real-time`} highlight />
      )}
      {job?.id && <StatLine label="Job ID" value={job.id} />}
    </div>
  );
}

function StatLine({
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
      <span
        style={{
          color: highlight ? "#6c63ff" : "#888",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}
