"use client";

import React from "react";

type Opt = { value: string | number; label: string };

type BarProps = {
  title: string;
  accent: "jcr" | "maitei";
  year: number;
  baseYear: number;
  onYear: (v: number) => void;
  onBaseYear: (v: number) => void;
  years: number[];
  hotel?: string;
  onHotel?: (v: string) => void;
  hotels?: { value: string; label: string }[];
  quarter: number;
  onQuarter: (v: number) => void;
  month: number;
  onMonth: (v: number) => void;
};

const ACC = {
  jcr: {
    bg: "rgba(165,0,0,0.10)",
    border: "rgba(165,0,0,0.25)",
    chip: "rgba(165,0,0,0.12)",
    chipOn: "rgba(165,0,0,0.22)",
    text: "#2b0a0a",
    strong: "#7b0000",
  },
  maitei: {
    bg: "rgba(0,140,255,0.10)",
    border: "rgba(0,140,255,0.25)",
    chip: "rgba(0,140,255,0.12)",
    chipOn: "rgba(0,140,255,0.22)",
    text: "#082235",
    strong: "#0066cc",
  },
};

function Chip({
  label,
  on,
  onClick,
  accent,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
  accent: "jcr" | "maitei";
}) {
  const a = ACC[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1px solid ${a.border}`,
        background: on ? a.chipOn : a.chip,
        padding: ".45rem .65rem",
        borderRadius: 999,
        cursor: "pointer",
        fontWeight: on ? 900 : 750,
        color: a.text,
        boxShadow: on ? "0 8px 22px rgba(0,0,0,0.10)" : "none",
        transform: on ? "translateY(-1px)" : "none",
      }}
    >
      {label}
    </button>
  );
}

function Select({
  value,
  onChange,
  options,
  accent,
}: {
  value: string | number;
  onChange: (v: any) => void;
  options: Opt[];
  accent: "jcr" | "maitei";
}) {
  const a = ACC[accent];
  return (
    <select
      value={value}
      onChange={(e) => onChange(typeof value === "number" ? Number(e.target.value) : e.target.value)}
      style={{
        border: `1px solid ${a.border}`,
        background: "white",
        padding: ".55rem .7rem",
        borderRadius: 12,
        fontWeight: 800,
        color: a.text,
        outline: "none",
      }}
    >
      {options.map((o) => (
        <option key={String(o.value)} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function StickyBar(p: BarProps) {
  const a = ACC[p.accent];

  const qOpts: Opt[] = [
    { value: 0, label: "Todos los trimestres" },
    { value: 1, label: "Q1" },
    { value: 2, label: "Q2" },
    { value: 3, label: "Q3" },
    { value: 4, label: "Q4" },
  ];
  const mOpts: Opt[] = [
    { value: 0, label: "Todos los meses" },
    { value: 1, label: "Enero" },
    { value: 2, label: "Febrero" },
    { value: 3, label: "Marzo" },
    { value: 4, label: "Abril" },
    { value: 5, label: "Mayo" },
    { value: 6, label: "Junio" },
    { value: 7, label: "Julio" },
    { value: 8, label: "Agosto" },
    { value: 9, label: "Septiembre" },
    { value: 10, label: "Octubre" },
    { value: 11, label: "Noviembre" },
    { value: 12, label: "Diciembre" },
  ];

  return (
    <div
      style={{
        position: "sticky",
        top: 10,
        zIndex: 50,
        borderRadius: 18,
        border: `1px solid ${a.border}`,
        background: a.bg,
        padding: ".85rem",
        backdropFilter: "blur(10px)",
        boxShadow: "0 14px 35px rgba(0,0,0,0.08)",
      }}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", alignItems: "center" }}>
        <div style={{ fontWeight: 950, fontSize: "1.05rem", color: a.strong }}>
          {p.title}
        </div>

        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontWeight: 850, opacity: 0.9 }}>Año</span>
          <Select
            accent={p.accent}
            value={p.year}
            onChange={p.onYear}
            options={p.years.map((y) => ({ value: y, label: String(y) }))}
          />
        </div>

        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontWeight: 850, opacity: 0.9 }}>Comparar vs</span>
          <Select
            accent={p.accent}
            value={p.baseYear}
            onChange={p.onBaseYear}
            options={p.years.map((y) => ({ value: y, label: String(y) }))}
          />
        </div>

        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontWeight: 850, opacity: 0.9 }}>Trimestre</span>
          <Select accent={p.accent} value={p.quarter} onChange={p.onQuarter} options={qOpts} />
        </div>

        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
          <span style={{ fontWeight: 850, opacity: 0.9 }}>Mes</span>
          <Select accent={p.accent} value={p.month} onChange={p.onMonth} options={mOpts} />
        </div>
      </div>

      {p.hotels && p.hotel !== undefined && p.onHotel && (
        <div style={{ marginTop: ".75rem", display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
          {p.hotels.map((h) => (
            <Chip
              key={h.value}
              label={h.label}
              on={p.hotel === h.value}
              onClick={() => p.onHotel?.(h.value)}
              accent={p.accent}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function JcrStickyFilters(props: Omit<BarProps, "title" | "accent">) {
  return <StickyBar {...props} title="Filtros Grupo JCR" accent="jcr" />;
}

export function MaiteiStickyFilters(props: Omit<BarProps, "title" | "accent" | "hotel" | "onHotel" | "hotels">) {
  return <StickyBar {...props} title="Filtros Grupo GOTEL (Maitei)" accent="maitei" />;
}
