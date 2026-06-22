import { COLORS } from "../../styles/theme";

interface Props {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function SectionHeading({ icon, title, subtitle, action }: Props) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
        marginBottom: "1rem",
        flex: 1,
      }}
    >
      <span style={{ color: COLORS.brand, display: "flex", alignItems: "center", flexShrink: 0 }}>
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ color: "#ccc", fontWeight: 600, fontSize: "0.95rem" }}>{title}</span>
        {subtitle && (
          <span style={{ color: "#3a3a5a", fontSize: "0.82rem", marginLeft: "0.6rem" }}>
            {subtitle}
          </span>
        )}
      </div>
      {action}
    </div>
  );
}
