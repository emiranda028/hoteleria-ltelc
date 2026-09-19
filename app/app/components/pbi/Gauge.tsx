"use client";

import { INK, LINE } from "./theme";

export default function Gauge({
  label,
  valuePct,
  color,
  size = 130,
}: {
  label: string;
  valuePct: number;
  color: string;
  size?: number;
}) {
  const total = 172.8;
  const filled = (Math.max(0, Math.min(100, valuePct)) / 100) * total;
  const height = size * (74 / 130);
  return (
    <div
      style={{
        background: "white",
        border: `1px solid ${LINE}`,
        borderRadius: 8,
        padding: "10px 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 12, color: INK, fontWeight: 500, marginBottom: 2, textAlign: "center" }}>{label}</div>
      <svg viewBox="0 0 140 80" style={{ width: size, height }}>
        <path d="M 15 70 A 55 55 0 0 1 125 70" fill="none" stroke="#eee" strokeWidth="16" />
        <path
          d="M 15 70 A 55 55 0 0 1 125 70"
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeDasharray={`${filled} ${total}`}
        />
      </svg>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: -6, color: INK }}>
        {valuePct.toFixed(2).replace(".", ",")}%
      </div>
    </div>
  );
}
