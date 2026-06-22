import { COLORS } from "../../styles/theme";

type Screen = "library" | "jobs";

interface Props {
  activeScreen?: string;
  onNav?: (screen: Screen) => void;
  children?: React.ReactNode;
}

export function Header({ activeScreen, onNav, children }: Props) {
  return (
    <header
      style={{
        borderBottom: `1px solid #1e1e2e`,
        padding: "0.75rem 2rem",
        marginBottom: "2rem",
        display: "flex",
        alignItems: "center",
        gap: "1.5rem",
      }}
    >
      <h1 style={{ color: COLORS.brand, margin: 0, fontSize: "1.4rem" }}>
        Video Subtitling Tool
      </h1>

      {onNav && (
        <nav style={{ display: "flex", gap: "0.25rem", flex: 1 }}>
          {(["library", "jobs"] as const).map((s) => (
            <button
              key={s}
              onClick={() => onNav(s)}
              style={{
                background: activeScreen === s ? "#1a1a2e" : "transparent",
                border: "none",
                borderRadius: 6,
                color: activeScreen === s ? COLORS.brand : COLORS.textDim,
                cursor: "pointer",
                padding: "0.35rem 0.85rem",
                fontSize: "0.85rem",
                fontWeight: activeScreen === s ? 600 : 400,
              }}
            >
              {s === "library" ? "My Videos" : "Jobs"}
            </button>
          ))}
        </nav>
      )}

      {children}
    </header>
  );
}
