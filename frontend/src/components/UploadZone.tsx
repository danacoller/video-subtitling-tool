import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { VideoResponse, uploadVideo } from "../api/client";

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
    noClick: true, // we handle click via button
  });

  return (
    <div>
      {/* Browse button row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <button
          onClick={() => {
            // #region agent log
            fetch('http://127.0.0.1:7501/ingest/65dcc4ee-58be-4a17-b658-52d45a02b11d',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53ef6a'},body:JSON.stringify({sessionId:'53ef6a',location:'UploadZone.tsx:44',message:'Upload button clicked (post-fix)',data:{openType:typeof open,isDisabled:progress!==null},timestamp:Date.now(),runId:'post-fix',hypothesisId:'A'})}).catch(()=>{});
            open();
            // #endregion
          }}
          disabled={progress !== null}
          style={{
            background: "#6c63ff",
            border: "none",
            borderRadius: 6,
            color: "#fff",
            cursor: progress !== null ? "not-allowed" : "pointer",
            padding: "0.55rem 1.25rem",
            fontSize: "0.95rem",
            opacity: progress !== null ? 0.5 : 1,
          }}
        >
          + Upload video
        </button>
        <span style={{ color: "#555", fontSize: "0.85rem" }}>or drag a file into the area below</span>
      </div>

      {/* Drop zone */}
      <div
        {...getRootProps()}
        style={{
          border: `2px dashed ${isDragActive ? "#6c63ff" : "#333"}`,
          borderRadius: 12,
          padding: "2rem",
          background: isDragActive ? "#1a1a2e" : "#0a0a12",
          cursor: "default",
          color: "#555",
          fontSize: "0.9rem",
          textAlign: "center",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <input {...getInputProps()} />
        {isDragActive ? (
          <p style={{ margin: 0, color: "#aaa" }}>Drop the video here…</p>
        ) : (
          <p style={{ margin: 0 }}>Drop a video file here · MP4, MOV, AVI, MKV, WebM</p>
        )}
      </div>

      {progress !== null && (
        <div style={{ marginTop: "0.75rem" }}>
          <div style={{ background: "#222", borderRadius: 6, height: 6, overflow: "hidden" }}>
            <div
              style={{
                width: `${progress}%`,
                background: "#6c63ff",
                height: "100%",
                transition: "width 0.2s",
              }}
            />
          </div>
          <p style={{ color: "#aaa", marginTop: "0.4rem", fontSize: "0.85rem" }}>
            Uploading… {progress}%
          </p>
        </div>
      )}

      {error && <p style={{ color: "#f44", marginTop: "0.5rem", fontSize: "0.85rem" }}>{error}</p>}
    </div>
  );
}
