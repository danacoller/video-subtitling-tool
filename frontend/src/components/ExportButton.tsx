import { exportVttUrl } from "../api/client";

interface Props {
  videoId: string;
}

export function ExportButton({ videoId }: Props) {
  return (
    <a
      href={exportVttUrl(videoId)}
      download={`subtitles-${videoId}.vtt`}
      style={{
        display: "inline-block",
        background: "#2d8a4e",
        color: "#fff",
        padding: "0.5rem 1.25rem",
        borderRadius: 6,
        textDecoration: "none",
        fontSize: "0.9rem",
      }}
    >
      Export .vtt
    </a>
  );
}
