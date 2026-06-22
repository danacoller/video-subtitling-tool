interface Props {
  color: string;
  label: string;
}

export function StatusBadge({ color, label }: Props) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.5rem",
        background: color + "22",
        border: `1px solid ${color}`,
        borderRadius: 6,
        padding: "0.4rem 0.9rem",
        color,
        fontSize: "0.9rem",
      }}
    >
      {label}
    </div>
  );
}
