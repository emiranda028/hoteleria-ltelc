"use client";

import { INK, INK_SOFT, LINE } from "./theme";

export function MiniBox({ label, value, pending = false }: { label: string; value: string | number; pending?: boolean }) {
  return (
    <div
      style={{
        background: pending ? "#fafafa" : "white",
        border: `1px solid ${LINE}`,
        padding: "8px 6px",
        textAlign: "center",
        borderRadius: 6,
      }}
      title={pending ? "Todavía no tenemos la fuente de este dato" : undefined}
    >
      <div style={{ fontSize: 10, color: INK_SOFT }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 600, marginTop: 2, color: pending ? "#b7b7b7" : INK }}>{value}</div>
    </div>
  );
}

export function DonutRubro({
  alojamiento,
  ayb,
  diversas,
  size = 92,
}: {
  alojamiento: number;
  ayb: number;
  diversas: number;
  size?: number;
}) {
  const total = alojamiento + ayb + diversas;
  if (total <= 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: size, color: "#b7b7b7", fontSize: 11 }}>
        Sin datos de rubro
      </div>
    );
  }
  const r = 16;
  const c = 2 * Math.PI * r;
  const segs = [
    { v: alojamiento, color: "#a61e3a" },
    { v: ayb, color: "#cfcfcf" },
    { v: diversas, color: "#1f3a6e" },
  ];
  let offset = 0;
  return (
    <svg viewBox="0 0 40 40" style={{ width: size, height: size }}>
      {segs.map((s, i) => {
        const frac = s.v / total;
        const dash = frac * c;
        const el = (
          <circle
            key={i}
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke={s.color}
            strokeWidth="8"
            strokeDasharray={`${dash} ${c - dash}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 20 20)"
          />
        );
        offset += dash;
        return el;
      })}
    </svg>
  );
}
