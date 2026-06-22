import { useState } from "react";
import { VideoResponse } from "../../api/client";
import { formatFileSize, formatVideoDuration } from "../../utils/format";

interface Props {
  video: VideoResponse;
  onClick: () => void;
  onDelete: () => void;
}

export function VideoCard({ video, onClick, onDelete }: Props) {
  const [deleting, setDeleting] = useState(false);

  const date = new Date(video.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const duration =
    video.duration_seconds != null
      ? formatVideoDuration(video.duration_seconds)
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
            {formatFileSize(video.size_bytes)}
            {duration && ` · ${duration}`}
            {` · ${date}`}
          </p>
        </div>
        <span style={{ color: "#444", fontSize: "0.8rem", marginRight: "0.5rem" }}>
          Open →
        </span>
      </button>

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
          if (!deleting)
            (e.currentTarget as HTMLButtonElement).style.background = "#2a0a0a";
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
