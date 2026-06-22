import type { CSSProperties } from "react";
import { CueResponse } from "../api/client";

function msToDisplay(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const millis = ms % 1000;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function displayToMs(value: string): number {
  const match = value.match(/^(\d+):(\d{2})\.(\d{3})$/);
  if (!match) return 0;
  const [, min, sec, ms] = match;
  return parseInt(min) * 60_000 + parseInt(sec) * 1_000 + parseInt(ms);
}

interface Props {
  cue: CueResponse;
  isActive: boolean;
  onSeek: (ms: number) => void;
  onUpdate: (id: string, patch: Partial<CueResponse>) => void;
  onDelete: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

export function CueRow({
  cue,
  isActive,
  onSeek,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: Props) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 120px 1fr auto",
        gap: "0.5rem",
        alignItems: "center",
        padding: "0.5rem 0.75rem",
        borderRadius: 6,
        background: isActive ? "#1a1a3e" : "#111",
        border: isActive ? "1px solid #6c63ff" : "1px solid #222",
        marginBottom: "0.4rem",
      }}
    >
      <input
        type="text"
        value={msToDisplay(cue.start_ms)}
        onClick={() => onSeek(cue.start_ms)}
        onChange={(e) =>
          onUpdate(cue.id, { start_ms: displayToMs(e.target.value) })
        }
        style={inputStyle}
        placeholder="mm:ss.mmm"
      />
      <input
        type="text"
        value={msToDisplay(cue.end_ms)}
        onChange={(e) =>
          onUpdate(cue.id, { end_ms: displayToMs(e.target.value) })
        }
        style={inputStyle}
        placeholder="mm:ss.mmm"
      />
      <input
        type="text"
        value={cue.text}
        onChange={(e) => onUpdate(cue.id, { text: e.target.value })}
        style={{ ...inputStyle, width: "100%" }}
        placeholder="Subtitle text…"
      />
      <div style={{ display: "flex", gap: "0.25rem" }}>
        <button onClick={() => onMoveUp(cue.id)} style={btnStyle} title="Move up">
          ↑
        </button>
        <button onClick={() => onMoveDown(cue.id)} style={btnStyle} title="Move down">
          ↓
        </button>
        <button
          onClick={() => onDelete(cue.id)}
          style={{ ...btnStyle, color: "#f44" }}
          title="Delete cue"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: "#1e1e2e",
  border: "1px solid #333",
  borderRadius: 4,
  color: "#ddd",
  padding: "0.3rem 0.5rem",
  fontSize: "0.85rem",
};

const btnStyle: CSSProperties = {
  background: "#222",
  border: "1px solid #333",
  borderRadius: 4,
  color: "#aaa",
  cursor: "pointer",
  padding: "0.25rem 0.5rem",
  fontSize: "0.85rem",
};
