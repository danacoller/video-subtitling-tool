import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { VideoResponse, uploadVideo } from "../api/client";
import { BTN, VIDEO_FRAME } from "../styles/theme";

interface Props {
  onUploaded: (video: VideoResponse) => void;
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
        onUploaded(video);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setProgress(null);
      }
    },
    [onUploaded]
  );

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: { "video/*": [".mp4", ".mov", ".avi", ".mkv", ".webm"] },
    multiple: false,
    disabled: progress !== null,
    noClick: true,
    noKeyboard: true,
  });

  const uploading = progress !== null;

  return (
    <div>
      <input {...getInputProps()} />

      <div style={{ marginBottom: "0.75rem" }}>
        <button
          type="button"
          onClick={() => open()}
          disabled={uploading}
          style={{
            ...BTN.primary,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.45rem",
            opacity: uploading ? 0.55 : 1,
          }}
        >
          <UploadButtonIcon />
          Upload video
        </button>
      </div>

      <div
        {...getRootProps()}
        onClick={() => {
          if (!uploading) open();
        }}
        onKeyDown={(e) => {
          if (!uploading && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            open();
          }
        }}
        style={{
          ...VIDEO_FRAME,
          boxSizing: "border-box",
          border: `2px dashed ${isDragActive ? "#6c63ff" : uploading ? "#2a2a3e" : "#2a2a42"}`,
          borderRadius: 8,
          background: isDragActive ? "#0f0f2a" : "#0d0d1c",
          cursor: uploading ? "default" : "pointer",
          textAlign: "center",
          transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
          outline: "none",
          boxShadow: isDragActive ? "0 0 0 4px #6c63ff22" : "none",
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
        }}
      >
        {uploading ? (
          <UploadingState progress={progress} />
        ) : isDragActive ? (
          <DragActiveState />
        ) : (
          <IdleState onBrowse={open} />
        )}
      </div>

      {error && (
        <div
          style={{
            marginTop: "0.75rem",
            padding: "0.6rem 1rem",
            background: "#1e0a0a",
            border: "1px solid #5a1a1a",
            borderRadius: 8,
            color: "#f66",
            fontSize: "0.85rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>✗</span>
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

function IdleState({ onBrowse }: { onBrowse: () => void }) {
  return (
    <>
      <UploadIcon />
      <p
        style={{
          margin: "0.9rem 0 0.3rem",
          color: "#c8c8e8",
          fontSize: "1.05rem",
          fontWeight: 600,
        }}
      >
        Drop a video here, or{" "}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onBrowse();
          }}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: "#6c63ff",
            textDecoration: "underline",
            textUnderlineOffset: 3,
            cursor: "pointer",
            font: "inherit",
            fontWeight: 600,
          }}
        >
          browse files
        </button>
      </p>
      <p style={{ margin: 0, color: "#444", fontSize: "0.8rem", letterSpacing: "0.02em" }}>
        MP4 · MOV · AVI · MKV · WebM
      </p>
    </>
  );
}

function DragActiveState() {
  return (
    <>
      <DropIcon />
      <p
        style={{
          margin: "0.9rem 0 0",
          color: "#9d97ff",
          fontSize: "1.05rem",
          fontWeight: 600,
        }}
      >
        Release to upload
      </p>
    </>
  );
}

function UploadingState({ progress }: { progress: number }) {
  return (
    <>
      <SpinnerIcon />
      <p style={{ margin: "0.9rem 0 0.6rem", color: "#aaa", fontSize: "0.95rem" }}>
        Uploading…{" "}
        <span style={{ color: "#6c63ff", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
          {progress}%
        </span>
      </p>
      <div
        style={{
          width: "100%",
          maxWidth: 320,
          margin: "0 auto",
          height: 5,
          background: "#1e1e30",
          borderRadius: 99,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: "100%",
            background: "linear-gradient(90deg, #5a52e0, #6c63ff)",
            borderRadius: 99,
            transition: "width 0.25s ease",
          }}
        />
      </div>
    </>
  );
}

function UploadButtonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6c63ff"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ opacity: 0.85 }}
    >
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function DropIcon() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6c63ff"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="8 17 12 21 16 17" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.88 18.09A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.29" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#6c63ff"
      strokeWidth="2"
      strokeLinecap="round"
      style={{
        animation: "spin 1s linear infinite",
      }}
    >
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
