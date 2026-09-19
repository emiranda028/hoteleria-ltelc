// app/components/HighlightsCarousel.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useHofData } from "./HofDataProvider";
import { HofRow } from "./hofModel";
import { formatMoney, formatPct, safeDiv } from "./useCsvClient";

/* =========================
   Helpers
========================= */

type Theme = "jcr" | "gotel";

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function fmtInt(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return Math.round(v).toLocaleString("es-AR");
}

function fmtMoneyMaybeUSD(n: number) {
  // si querés ARS en algún momento, lo cambiamos.
  return formatMoney(n);
}

function pickTheme(theme: Theme) {
  // gradientes distintos por bloque
  if (theme === "gotel") {
    return {
      bg: "linear-gradient(135deg, rgba(0,160,255,.22), rgba(0,255,210,.16))",
      pill: "rgba(0,160,255,.16)",
      border: "rgba(0,160,255,.35)",
      title: "rgba(255,255,255,.92)",
      sub: "rgba(255,255,255,.80)",
      accent: "rgba(0,210,255,.9)",
    };
  }
  // JCR Marriott-ish
  return {
    bg: "linear-gradient(135deg, rgba(210,0,35,.20), rgba(255,170,0,.12))",
    pill: "rgba(210,0,35,.14)",
    border: "rgba(210,0,35,.35)",
    title: "rgba(255,255,255,.92)",
    sub: "rgba(255,255,255,.80)",
    accent: "rgba(255,80,80,.95)",
  };
}

type KpiPack = {
  label: string;
  value: string;
  note?: string;
};

function computeKpis(rows: HofRow[]): {
  kpis: KpiPack[];
  meta: { nDays: number; occRooms: number };
} {
  if (!rows || rows.length === 0) {
    return {
      kpis: [
        { label: "Ocupación", value: "—", note: "Sin datos" },
        { label: "ADR", value: "—" },
        { label: "Room Revenue", value: "—" },
        { label: "Doble ocupación", value: "—" },
        { label: "REVPar (aprox.)", value: "—" },
        { label: "Personas in-house", value: "—" },
      ],
      meta: { nDays: 0, occRooms: 0 },
    };
  }

  // Campos normalizados por hofModel:
  //  - totalOcc (rooms occupied)
  //  - houseUse
  //  - occPct01  (0..1 si venía %)
  //  - roomRevenue
  //  - adr
  //  - persons (Adl.&Chl.)
  //  - fechaISO (YYYY-MM-DD)
  //  - dow (texto)
  // Si alguno faltara, ponemos fallback a 0 en el normalize.

  const nDays = rows.length;

  const totalOccRooms = rows.reduce((a, r) => a + (r.totalOcc || 0), 0);
  const totalHouseUse = rows.reduce((a, r) => a + (r.houseUse || 0), 0);
  const occRoomsMinusHouse = Math.max(0, totalOccRooms - totalHouseUse);

  const totalRevenue = rows.reduce((a, r) => a + (r.roomRevenue || 0), 0);
  const totalPersons = rows.reduce((a, r) => a + (r.persons || 0), 0);

  // Promedios ponderados
  const weightRooms = (r: HofRow) => Math.max(0, (r.totalOcc || 0) - (r.houseUse || 0));

  const sumW = rows.reduce((a, r) => a + weightRooms(r), 0);

  // Ocupación: NO se suma. Usamos promedio ponderado por rooms occupied.
  const occWeighted = clamp01(
    safeDiv(
      rows.reduce((a, r) => a + (r.occPct01 || 0) * weightRooms(r), 0),
      sumW
    )
  );

  // ADR: promedio ponderado por rooms occupied (sin house use)
  const adrWeighted = safeDiv(
    rows.reduce((a, r) => a + (r.adr || 0) * weightRooms(r), 0),
    sumW
  );

  // Doble ocupación: personas / rooms occupied minus house
  const doubleOcc = safeDiv(totalPersons, Math.max(1, occRoomsMinusHouse));

  // REVPar aproximado (tu definición previa): ADR * doble ocupación
  const revparApprox = adrWeighted * doubleOcc;

  const kpis: KpiPack[] = [
    { label: "Ocupación", value: formatPct(occWeighted), note: "Prom. ponderado" },
    { label: "ADR", value: fmtMoneyMaybeUSD(adrWeighted), note: "Prom. ponderado" },
    { label: "Room Revenue", value: fmtMoneyMaybeUSD(totalRevenue), note: `Suma (${fmtInt(nDays)} días)` },
    { label: "Doble ocupación", value: doubleOcc.toFixed(2), note: "Personas / Hab." },
    { label: "REVPar (aprox.)", value: fmtMoneyMaybeUSD(revparApprox), note: "ADR × Doble ocup." },
    { label: "Personas in-house", value: fmtInt(totalPersons), note: `Acum. (${fmtInt(nDays)} días)` },
  ];

  return { kpis, meta: { nDays, occRooms: occRoomsMinusHouse } };
}

/* =========================
   UI
========================= */

function KpiCard({
  label,
  value,
  note,
  theme,
}: {
  label: string;
  value: string;
  note?: string;
  theme: Theme;
}) {
  const t = pickTheme(theme);

  return (
    <div
      className="card"
      style={{
        padding: "1rem",
        borderRadius: 18,
        border: `1px solid ${t.border}`,
        background: "rgba(0,0,0,.22)",
        backdropFilter: "blur(8px)",
        minWidth: 240,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "center" }}>
        <div style={{ fontSize: ".9rem", opacity: 0.92, color: t.sub }}>{label}</div>
        <div
          style={{
            padding: ".22rem .55rem",
            borderRadius: 999,
            background: t.pill,
            border: `1px solid ${t.border}`,
            fontSize: ".75rem",
            color: t.title,
            whiteSpace: "nowrap",
          }}
        >
          KPI
        </div>
      </div>

      <div style={{ marginTop: ".4rem", fontSize: "1.75rem", fontWeight: 900, letterSpacing: "-.02em", color: t.title }}>
        {value}
      </div>

      {note ? (
        <div style={{ marginTop: ".25rem", fontSize: ".85rem", opacity: 0.80, color: t.sub }}>{note}</div>
      ) : (
        <div style={{ marginTop: ".25rem", height: "1.1rem" }} />
      )}
    </div>
  );
}

export default function HighlightsCarousel({
  group = "jcr",
  title,
  subtitle,
  autoplayMs = 4200,
}: {
  group?: Theme; // "jcr" o "gotel"
  title?: string;
  subtitle?: string;
  autoplayMs?: number;
}) {
  const theme: Theme = group;

  const {
    loading,
    error,
    year,
    baseYear,
    hof,
    jcrHotel,
    maiteiOn,
    jcrRows,
    maiteiRows,
  } = useHofData();

  const t = pickTheme(theme);

  // filas a usar según bloque
  const rows = theme === "gotel" ? maiteiRows : jcrRows;

  const { kpis } = useMemo(() => computeKpis(rows), [rows]);

  // "slides": 1 KPI por slide, o podés agrupar de a 2 si querés.
  const slides = useMemo(() => {
    return kpis.map((k) => [k]);
  }, [kpis]);

  const [idx, setIdx] = useState(0);
  const hoveringRef = useRef(false);

  useEffect(() => {
    if (!slides || slides.length <= 1) return;

    const id = setInterval(() => {
      if (hoveringRef.current) return;
      setIdx((p) => (p + 1) % slides.length);
    }, autoplayMs);

    return () => clearInterval(id);
  }, [slides, autoplayMs]);

  // reset índice cuando cambia el filtro fuerte (hotel/año/hof)
  useEffect(() => {
    setIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, year, baseYear, hof, jcrHotel, maiteiOn]);

  const headerTitle =
    title ??
    (theme === "gotel"
      ? `KPIs destacados — Grupo Gotel (Maitei) · ${year} vs ${baseYear}`
      : `KPIs destacados — Grupo JCR (${jcrHotel}) · ${year} vs ${baseYear}`);

  const headerSubtitle =
    subtitle ??
    (theme === "gotel"
      ? `HoF: ${hof === "All" ? "History + Forecast" : hof} · Fuente: hf_diario.csv`
      : `HoF: ${hof === "All" ? "History + Forecast" : hof} · Fuente: hf_diario.csv`);

  return (
    <section
      className="card"
      style={{
        padding: "1rem",
        borderRadius: 22,
        border: `1px solid ${t.border}`,
        background: t.bg,
        overflow: "hidden",
      }}
      onMouseEnter={() => (hoveringRef.current = true)}
      onMouseLeave={() => (hoveringRef.current = false)}
    >
      {/* header */}
      <div style={{ display: "grid", gap: ".25rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".6rem", flexWrap: "wrap" }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: t.accent,
              boxShadow: "0 0 0 3px rgba(255,255,255,.10)",
            }}
          />
          <div style={{ fontWeight: 950, fontSize: "1.1rem", color: t.title }}>{headerTitle}</div>
        </div>
        <div style={{ fontSize: ".92rem", color: t.sub, opacity: 0.95 }}>{headerSubtitle}</div>
      </div>

      {/* body */}
      <div style={{ marginTop: ".85rem" }}>
        {loading ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18, background: "rgba(0,0,0,.18)" }}>
            Cargando KPIs…
          </div>
        ) : error ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18, background: "rgba(0,0,0,.18)" }}>
            Error: {error}
          </div>
        ) : rows.length === 0 ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18, background: "rgba(0,0,0,.18)" }}>
            Sin filas H&F para el filtro actual.
          </div>
        ) : (
          <>
            {/* slide viewport */}
            <div
              style={{
                position: "relative",
                width: "100%",
                overflow: "hidden",
                borderRadius: 18,
              }}
            >
              <div
                style={{
                  display: "flex",
                  transform: `translateX(-${idx * 100}%)`,
                  transition: "transform 550ms ease",
                  width: `${slides.length * 100}%`,
                }}
              >
                {slides.map((s, i) => (
                  <div key={i} style={{ width: `${100 / slides.length}%`, paddingRight: ".85rem" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                        gap: ".85rem",
                      }}
                    >
                      {s.map((k) => (
                        <KpiCard key={k.label} label={k.label} value={k.value} note={k.note} theme={theme} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* dots */}
            <div style={{ display: "flex", gap: ".4rem", justifyContent: "center", marginTop: ".75rem" }}>
              {slides.map((_, i) => {
                const active = i === idx;
                return (
                  <button
                    key={i}
                    onClick={() => setIdx(i)}
                    aria-label={`Slide ${i + 1}`}
                    style={{
                      width: active ? 22 : 10,
                      height: 10,
                      borderRadius: 999,
                      border: `1px solid ${t.border}`,
                      background: active ? t.accent : "rgba(255,255,255,.25)",
                      cursor: "pointer",
                      transition: "all 220ms ease",
                    }}
                  />
                );
              })}
            </div>

            <div style={{ marginTop: ".45rem", fontSize: ".82rem", opacity: 0.75, color: t.sub, textAlign: "center" }}>
              Autoplay (pausa al pasar el mouse) · Click en los puntos para navegar
            </div>
          </>
        )}
      </div>
    </section>
  );
}
