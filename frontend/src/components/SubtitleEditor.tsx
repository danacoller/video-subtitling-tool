import { useState } from "react";
import { CueResponse, bulkReplaceCues } from "../api/client";
import { CueRow } from "./CueRow";

interface Props {
  videoId: string;
  initialCues: CueResponse[];
  currentTimeMs: number;
  onSeek: (ms: number) => void;
}

export function SubtitleEditor({
  videoId,
  initialCues,
  currentTimeMs,
  onSeek,
}: Props) {
  const [cues, setCues] = useState<CueResponse[]>(initialCues);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  function handleUpdate(id: string, patch: Partial<CueResponse>) {
    setCues((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
    );
  }

  function handleDelete(id: string) {
    setCues((prev) => prev.filter((c) => c.id !== id));
  }

  function handleMoveUp(id: string) {
    setCues((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx <= 0) return prev;
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next.map((c, i) => ({ ...c, position: i + 1 }));
    });
  }

  function handleMoveDown(id: string) {
    setCues((prev) => {
      const idx = prev.findIndex((c) => c.id === id);
      if (idx < 0 || idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next.map((c, i) => ({ ...c, position: i + 1 }));
    });
  }

  function handleAddCue() {
    const last = cues[cues.length - 1];
    const newStart = last ? last.end_ms : 0;
    const newCue: CueResponse = {
      id: `temp-${Date.now()}`,
      video_id: videoId,
      start_ms: newStart,
      end_ms: newStart + 2000,
      text: "",
      position: cues.length + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    setCues((prev) => [...prev, newCue]);
  }

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await bulkReplaceCues(
        videoId,
        cues.map((c) => ({
          start_ms: c.start_ms,
          end_ms: c.end_ms,
          text: c.text,
        }))
      );
      setCues(saved);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "120px 120px 1fr auto",
          gap: "0.5rem",
          padding: "0.25rem 0.75rem",
          color: "#666",
          fontSize: "0.75rem",
          marginBottom: "0.25rem",
        }}
      >
        <span>Start</span>
        <span>End</span>
        <span>Text</span>
        <span>Actions</span>
      </div>

      <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
        {cues.map((cue) => (
          <CueRow
            key={cue.id}
            cue={cue}
            isActive={currentTimeMs >= cue.start_ms && currentTimeMs < cue.end_ms}
            onSeek={onSeek}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
          />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          gap: "0.75rem",
          marginTop: "1rem",
          alignItems: "center",
        }}
      >
        <button onClick={handleAddCue} style={outlineBtn}>
          + Add cue
        </button>
        <button onClick={handleSave} disabled={saving} style={primaryBtn}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        {saveError && <span style={{ color: "#f44" }}>{saveError}</span>}
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  background: "#6c63ff",
  border: "none",
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
  padding: "0.5rem 1.25rem",
  fontSize: "0.9rem",
};

const outlineBtn: React.CSSProperties = {
  background: "transparent",
  border: "1px solid #444",
  borderRadius: 6,
  color: "#aaa",
  cursor: "pointer",
  padding: "0.5rem 1rem",
  fontSize: "0.9rem",
};
