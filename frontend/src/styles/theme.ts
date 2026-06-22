import type { CSSProperties } from "react";

export const COLORS = {
  brand: "#6c63ff",
  bg: "#0a0a14",
  surface: "#111",
  surfaceAlt: "#0d0d1c",
  border: "#222",
  text: "#e0e0e0",
  textMuted: "#aaa",
  textDim: "#555",
  textFaint: "#444",
  success: "#2d8a4e",
  error: "#f44",
  errorBg: "#2a0a0a",
  errorBorder: "#f44",
} as const;

export const BTN: Record<string, CSSProperties> = {
  primary: {
    background: COLORS.brand,
    border: "none",
    borderRadius: 6,
    color: "#fff",
    cursor: "pointer",
    padding: "0.6rem 1.5rem",
    fontSize: "1rem",
  },
  outline: {
    background: "transparent",
    border: "1px solid #444",
    borderRadius: 6,
    color: COLORS.textMuted,
    cursor: "pointer",
    padding: "0.5rem 1rem",
    fontSize: "0.9rem",
  },
  back: {
    background: "transparent",
    border: "1px solid #333",
    borderRadius: 6,
    color: "#888",
    cursor: "pointer",
    padding: "0.35rem 0.9rem",
    fontSize: "0.85rem",
  },
  retry: {
    background: "transparent",
    border: `1px solid ${COLORS.error}`,
    borderRadius: 6,
    color: "#f66",
    cursor: "pointer",
    padding: "0.35rem 0.9rem",
    fontSize: "0.85rem",
    whiteSpace: "nowrap" as const,
  },
  deleteAll: {
    background: "transparent",
    border: "1px solid #3a1515",
    borderRadius: 6,
    color: "#c44",
    cursor: "pointer",
    padding: "0.3rem 0.8rem",
    fontSize: "0.8rem",
  },
};

export const ROOT_STYLE: CSSProperties = {
  minHeight: "100vh",
  background: COLORS.bg,
  color: COLORS.text,
  fontFamily: "'Segoe UI', system-ui, sans-serif",
  boxSizing: "border-box",
};
