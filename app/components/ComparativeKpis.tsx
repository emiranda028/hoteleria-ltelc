"use client";

import React, { useMemo } from "react";
import { useHofData } from "./HofDataProvider";
import { HofRow } from "./hofModel";
import { formatMoney, formatPct, safeDiv } from "./useCsvClient";

type Theme = "jcr" | "gotel";

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

function pickTheme(theme: Theme) {
  if (theme === "gotel") {
    return {
      border: "rgba(0,160,255,.35)",
      bg: "rgba(0,0,0,.22)",
      title: "rgba(255,255,255,.92)",
      sub: "rgba(255,255,255,.80)",
      chip: "rgba(0,160,255,.16)",
      up: "rgba(0,220,170,.95)",
      down: "rgba(255,110,110,.95)",
    };
  }
  return {
    border: "rgba(210,0,35,.35)",
    bg: "rgba(0,0,0,.22)",
    title: "rgba(255,255,255,.92)",
    sub: "rgba(255,255,255,.80)",
    chip: "rgba(210,0,35,.14)",
    up: "rgba(0,220,170,.95)",
    down: "rgba(255,110,110,.95)",
  };
}

function weightRooms(r: HofRow) {
  return Math.max(0, (r.totalOcc || 0) - (r.houseUse || 0));
}

function computeAgg(rows: HofRow[]) {
  if (!rows || rows.length === 0) {
    return {
      n: 0,
      occ: 0,
      adr: 0,
      revenue: 0,
      persons: 0,
      doubleOcc: 0,
      revparApprox: 0,
    };
  }

  const revenue = rows.reduce((a, r) => a + (r.roomRevenue || 0), 0);
  const persons = rows.reduce((a, r) => a + (r.persons || 0), 0);

  const wSum = rows.reduce((a, r) => a + weightRooms(r), 0);

  const occ = clamp01(
    safeDiv(
      rows.reduce((a, r) => a + (r.occPct01 || 0) * weightRooms(r), 0),
      wSum
    )
  );

  const adr = safeDiv(
    rows.reduce((a, r) => a + (r.adr || 0) * weightRooms(r), 0),
    wSum
  );

  const occRoomsMinusHouse = Math.max(
    1,
    rows.reduce((a, r) => a + (r.totalOcc || 0) - (r.houseUse || 0), 0)
  );

  const doubleOcc = safeDiv(persons, occRoomsMinusHouse);
  const revparApprox = adr * doubleOcc;

  return {
    n: rows.length,
    occ,
    adr,
    revenue,
    persons,
    doubleOcc,
    revparApprox,
  };
}

function deltaPct(curr: number, base: number) {
  if (!Number.isFinite(curr) || !Number.isFinite(base) || base === 0) return 0;
  return (curr - base) / base;
}

function MetricCard({
  label,
  curr,
  base,
  fmt,
  theme,
}: {
  label: string;
  curr: number;
  base: number;
  fmt: (n: number) => string;
  theme: Theme;
}) {
  const t = pickTheme(theme);
  const d = deltaPct(curr, base);
  const up = d >= 0;
  const dText = `${up ? "+" : ""}${(d * 100).toFixed(1)}%`;
  const dColor = up ? t.up : t.down;

  return (
    <div
      className="card"
      style={{
        padding: "1rem",
        borderRadius: 18,
        border: `1px solid ${t.border}`,
        background: t.bg,
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "center" }}>
        <div style={{ fontSize: ".92rem", opacity: 0.92, color: t.sub }}>{label}</div>
        <div
          style={{
            padding: ".22rem .55rem",
            borderRadius: 999,
            border: `1px solid ${t.border}`,
            background: t.chip,
            fontSize: ".78rem",
            color: t.title,
            whiteSpace: "nowrap",
          }}
        >
          vs base
        </div>
      </div>

      <div style={{ marginTop: ".45rem", display: "grid", gap: ".25rem" }}>
        <div style={{ fontSize: "1.55rem", fontWeight: 950, color: t.title }}>{fmt(curr)}</div>
        <div style={{ fontSize: ".9rem", opacity: 0.80, color: t.sub }}>
          Base: <b>{fmt(base)}</b>
        </div>
      </div>

      <div style={{ marginTop: ".45rem", fontSize: ".9rem", fontWeight: 800, color: dColor }}>
        {dText}
      </div>
    </div>
  );
}

export default function ComparativeKpis({
  group = "jcr",
  title,
}: {
  group?: Theme;
  title?: string;
}) {
  const theme: Theme = group;
  const { loading, error, year, baseYear, jcrRows, maiteiRows, jcrHotel, hof } = useHofData();

  const rows = theme === "gotel" ? maiteiRows : jcrRows;

  // baseYearRows: filtramos por año dentro del provider (si ya te lo da separado mejor),
  // acá asumimos que rows ya viene filtrado por year/baseYear dentro del provider.
  // Si no, lo resolvemos en HofDataProvider (te lo paso abajo).
  const { currRows, baseRows } = useMemo(() => {
    const curr = rows.filter((r) => r.year === year);
    const base = rows.filter((r) => r.year === baseYear);
    return { currRows: curr, baseRows: base };
  }, [rows, year, baseYear]);

  const curr = useMemo(() => computeAgg(currRows), [currRows]);
  const base = useMemo(() => computeAgg(baseRows), [baseRows]);

  const header =
    title ??
    (theme === "gotel"
      ? `Comparativa principales indicadores — Maitei · ${year} vs ${baseYear}`
      : `Comparativa principales indicadores — JCR (${jcrHotel}) · ${year} vs ${baseYear}`);

  return (
    <section className="section">
      <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
        {header}
      </div>
      <div style={{ fontSize: ".92rem", opacity: 0.8, marginTop: ".25rem" }}>
        HoF: {hof === "All" ? "History + Forecast" : hof}
      </div>

      <div style={{ marginTop: ".85rem" }}>
        {loading ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
            Cargando comparativa…
          </div>
        ) : error ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
            Error: {error}
          </div>
        ) : curr.n === 0 || base.n === 0 ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
            Sin filas suficientes para comparar (revisá filtros Año/Base/HoF).
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: ".85rem",
            }}
          >
            <MetricCard label="Ocupación" curr={curr.occ} base={base.occ} fmt={formatPct} theme={theme} />
            <MetricCard label="ADR" curr={curr.adr} base={base.adr} fmt={formatMoney} theme={theme} />
            <MetricCard label="Room Revenue" curr={curr.revenue} base={base.revenue} fmt={formatMoney} theme={theme} />
            <MetricCard
              label="Doble ocupación"
              curr={curr.doubleOcc}
              base={base.doubleOcc}
              fmt={(n) => n.toFixed(2)}
              theme={theme}
            />
            <MetricCard
              label="REVPar (aprox.)"
              curr={curr.revparApprox}
              base={base.revparApprox}
              fmt={formatMoney}
              theme={theme}
            />
            <MetricCard
              label="Personas in-house"
              curr={curr.persons}
              base={base.persons}
              fmt={(n) => Math.round(n).toLocaleString("es-AR")}
              theme={theme}
            />
          </div>
        )}
      </div>
    </section>
  );
}
