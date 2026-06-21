import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { uploadVideo } from "../api/client";

interface Props {
  onUploaded: (videoId: string) => void;
}

export function UploadZone({ onUploaded }: Props) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (files: File[]) => {
      const file = files[0];
      if (!file) return;
      setError(null);
      setProgress(0);
      try {
        const video = await uploadVideo(file, setProgress);
        onUploaded(video.id);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setProgress(null);
      }
    },
    [onUploaded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "video/*": [".mp4", ".mov", ".avi", ".mkv", ".webm"] },
    multiple: false,
    disabled: progress !== null,
  });

  return (
    <div style={{ textAlign: "center" }}>
      <div
        {...getRootProps()}
        style={{
          border: "2px dashed #555",
          borderRadius: 12,
          padding: "3rem 2rem",
          background: isDragActive ? "#1a1a2e" : "#0f0f1a",
          cursor: progress !== null ? "not-allowed" : "pointer",
          color: "#aaa",
          fontSize: "1.1rem",
        }}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p>Drop the video here…</p>
        ) : (
          <p>Drag & drop a video file here, or click to select</p>
        )}
        <p style={{ fontSize: "0.85rem", color: "#666" }}>
          Supported: MP4, MOV, AVI, MKV, WebM
        </p>
      </div>

      {progress !== null && (
        <div style={{ marginTop: "1rem" }}>
          <div
            style={{
              background: "#222",
              borderRadius: 6,
              height: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                background: "#6c63ff",
                height: "100%",
                transition: "width 0.2s",
              }}
            />
          </div>
          <p style={{ color: "#aaa", marginTop: "0.5rem" }}>
            Uploading… {progress}%
          </p>
        </div>
      )}

      {error && <p style={{ color: "#f44", marginTop: "0.5rem" }}>{error}</p>}
    </div>
  );
}
