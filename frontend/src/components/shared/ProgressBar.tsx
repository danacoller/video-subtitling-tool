import { COLORS } from "../../styles/theme";

interface Props {
  value: number;
  maxWidth?: number;
  color?: string;
  height?: number;
}

export function ProgressBar({
  value,
  maxWidth = 400,
  color = COLORS.brand,
  height = 8,
}: Props) {
  return (
    <div
      style={{
        background: "#222",
        borderRadius: 6,
        height,
        overflow: "hidden",
        maxWidth,
      }}
    >
      <div
        style={{
          width: `${value}%`,
          background: color,
          height: "100%",
          transition: "width 0.3s",
        }}
      />
    </div>
  );
}
