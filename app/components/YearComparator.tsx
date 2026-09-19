"use client";

import React, { useEffect, useMemo, useState } from "react";
import SectionTitle from "./ui/SectionTitle";
import Pill from "./ui/Pill";
import { useCsvClient, num, pct01, CsvRow } from "./useCsvClient";

/* =========================================================
   Props
========================================================= */

type Props = {
  filePath: string;
  year: number;
  baseYear: number;

  /** "" => todos; si viene "MAITEI" => sólo ese */
  hotelFilter: string;
};

/* =========================================================
   Helpers (keys, fechas, normalización)
========================================================= */

function normKey(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[“”"]/g, "")
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function pickKey(keys: string[], candidates: string[]): string {
  const K = keys.map((k) => ({ raw: k, n: normKey(k) }));

  // match exact
  for (const c of candidates) {
    const cn = normKey(c);
    const hit = K.find((x) => x.n === cn);
    if (hit) return hit.raw;
  }
  // match contains
  for (const c of candidates) {
    const cn = normKey(c);
    const hit = K.find((x) => x.n.includes(cn));
    if (hit) return hit.raw;
  }
  return "";
}

function parseDateSmart(v: any): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;

  const s = String(v).trim();
  if (!s) return null;

  // dd/mm/yyyy (preferido por "Fecha")
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yy = Number(m1[3]);
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  // dd-mm-yy (a veces aparece en Date "01-06-22 Wed")
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    let yy = Number(m2[3]);
    if (yy < 100) yy = 2000 + yy;
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);

  return null;
}

function monthName(m: number): string {
  return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"][m] ?? String(m + 1);
}

function monthLong(m: number): string {
  return ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][m] ?? String(m + 1);
}

function quarterOfMonth(m: number): 1 | 2 | 3 | 4 {
  if (m <= 2) return 1;
  if (m <= 5) return 2;
  if (m <= 8) return 3;
  return 4;
}

function weekdayName(d: number): string {
  // 0 Domingo, 1 Lunes...
  return ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"][d] ?? String(d);
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}

function formatMoneyUsd(n: number): string {
  return n.toLocaleString("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatPct01(n: number): string {
  return (n * 100).toFixed(1) + "%";
}

function safeDiv(a: number, b: number): number {
  if (!b) return 0;
  return a / b;
}

function deltaPct(cur: number, base: number): number {
  if (!base) return 0;
  return (cur - base) / base;
}

type Tone = "jcr" | "gotel";

function toneForHotel(hotelFilter: string): Tone {
  // IMPORTANTE: si es "Todos" (""), sigue siendo JCR (rojo/violeta)
  return String(hotelFilter ?? "").toUpperCase() === "MAITEI" ? "gotel" : "jcr";
}

function gradMain(tone: Tone): string {
  // JCR rojo->violeta, GOTEL celeste->azul
  return tone === "jcr"
    ? "linear-gradient(135deg, rgba(220,38,38,.95), rgba(139,92,246,.70))"
    : "linear-gradient(135deg, rgba(14,165,233,.95), rgba(59,130,246,.75))";
}

function gradBar(tone: Tone): string {
  return tone === "jcr"
    ? "linear-gradient(90deg, rgba(220,38,38,.95), rgba(139,92,246,.70))"
    : "linear-gradient(90deg, rgba(14,165,233,.95), rgba(59,130,246,.75))";
}

function subtleBg(tone: Tone): string {
  return tone === "jcr" ? "rgba(220,38,38,.07)" : "rgba(14,165,233,.07)";
}

function medal(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "🏅";
}

function deltaColor(delta: number): string {
  // verde/rojo bien distinguible
  if (delta > 0.0005) return "#22c55e"; // green-500
  if (delta < -0.0005) return "#ef4444"; // red-500
  return "rgba(255,255,255,.75)";
}

/* =========================================================
   Modelado de filas H&F
========================================================= */

type HfRow = {
  empresa: string;
  hof: string; // History / Forecast
  date: Date;
  year: number;
  month: number; // 0-11
  quarter: 1 | 2 | 3 | 4;
  weekday: number; // 0-6

  occRooms: number; // "Total Occ."
  occPct: number; // Occ.% 0..1
  roomRevenue: number;
};

type Agg = {
  key: string;
  countDays: number;

  sumOccPct: number; // promedio simple por día
  sumRevenue: number;
  sumOccRooms: number;
};

function emptyAgg(key: string): Agg {
  return {
    key,
    countDays: 0,
    sumOccPct: 0,
    sumRevenue: 0,
    sumOccRooms: 0,
  };
}

function addAgg(a: Agg, r: HfRow) {
  a.countDays += 1;
  a.sumOccPct += r.occPct;
  a.sumRevenue += r.roomRevenue;
  a.sumOccRooms += r.occRooms;
}

function finalizeAgg(a: Agg) {
  const avgOcc = a.countDays ? a.sumOccPct / a.countDays : 0;
  const revenueTotal = a.sumRevenue;
  const occRoomsTotal = a.sumOccRooms;

  return {
    ...a,
    avgOcc,
    revenueTotal,
    occRoomsTotal,
  };
}

/* =========================================================
   UI bits
========================================================= */

function Card({
  children,
  style,
}: React.PropsWithChildren<{ style?: React.CSSProperties }>) {
  return (
    <div
      className="card"
      style={{
        padding: "1rem",
        borderRadius: 18,
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.12)",
        boxShadow: "0 16px 34px rgba(0,0,0,.18)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function BigKpiCarousel({
  tone,
  items,
  intervalMs = 4500,
}: {
  tone: Tone;
  items: {
    label: string;
    value: string;
    baseText: string; // "Base 2024: ..."
    deltaText: string; // "Δ +2.1%"
    delta: number;
  }[];
  intervalMs?: number;
}) {
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (!items.length) return;
    const t = window.setInterval(() => {
      setIdx((p) => (p + 1) % items.length);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [items.length, intervalMs]);

  const it = items[idx] ?? items[0];

  return (
    <div
      style={{
        borderRadius: 22,
        border: "1px solid rgba(255,255,255,.14)",
        background: "rgba(255,255,255,.05)",
        overflow: "hidden",
        position: "relative",
        minHeight: 140,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: gradMain(tone),
          opacity: 0.22,
        }}
      />
      <div style={{ position: "relative", padding: "1.15rem 1.2rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".6rem" }}>
          <div style={{ fontSize: ".95rem", fontWeight: 900, opacity: 0.9 }}>{it?.label}</div>
          <div style={{ marginLeft: "auto", display: "flex", gap: ".35rem" }}>
            {items.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: 999,
                  background: i === idx ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.28)",
                }}
              />
            ))}
          </div>
        </div>

        <div style={{ marginTop: ".55rem", fontSize: "2.3rem", fontWeight: 950, letterSpacing: -0.3 }}>
          {it?.value}
        </div>

        <div style={{ marginTop: ".25rem", display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "baseline" }}>
          <div style={{ opacity: 0.82 }}>{it?.baseText}</div>
          <div style={{ fontWeight: 950, color: deltaColor(it?.delta ?? 0) }}>{it?.deltaText}</div>
        </div>
      </div>
    </div>
  );
}

function BarRow({
  label,
  valueRight,
  pctWidth,
  tone,
  subLeft,
}: {
  label: string;
  valueRight: string;
  pctWidth: number;
  tone: Tone;
  subLeft?: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "240px 1fr 140px",
        gap: ".85rem",
        alignItems: "center",
        padding: ".55rem .6rem",
        borderRadius: 14,
        background: "rgba(255,255,255,.03)",
        border: "1px solid rgba(255,255,255,.08)",
      }}
    >
      <div>
        <div style={{ fontWeight: 900, opacity: 0.95 }}>{label}</div>
        {subLeft ? <div style={{ marginTop: ".15rem", fontSize: ".9rem", opacity: 0.75 }}>{subLeft}</div> : null}
      </div>

      <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
        <div style={{ width: `${Math.max(0, Math.min(100, pctWidth))}%`, height: "100%", background: gradBar(tone) }} />
      </div>

      <div style={{ textAlign: "right", fontWeight: 950 }}>{valueRight}</div>
    </div>
  );
}

function RankRow({
  tone,
  rank,
  label,
  occ,
  revenue,
  maxOcc,
}: {
  tone: Tone;
  rank: number;
  label: string;
  occ: number;
  revenue: number;
  maxOcc: number;
}) {
  const w = safeDiv(occ, maxOcc) * 100;

  return (
    <div
      style={{
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,.12)",
        background: "rgba(255,255,255,.05)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: gradMain(tone),
          opacity: 0.08,
        }}
      />
      <div style={{ position: "relative", padding: ".8rem .9rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: ".65rem", marginBottom: ".55rem" }}>
          <div
            style={{
              minWidth: 62,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: ".35rem",
              padding: ".35rem .55rem",
              borderRadius: 999,
              background: subtleBg(tone),
              border: "1px solid rgba(255,255,255,.14)",
              fontWeight: 950,
            }}
          >
            <span>{medal(rank)}</span>
            <span>#{rank}</span>
          </div>

          <div style={{ fontWeight: 950, opacity: 0.95 }}>{label}</div>

          <div style={{ marginLeft: "auto", fontWeight: 950 }}>
            {formatPct01(occ)}
          </div>
        </div>

        <div style={{ height: 10, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
          <div style={{ width: `${Math.max(0, Math.min(100, w))}%`, height: "100%", background: gradBar(tone) }} />
        </div>

        <div style={{ marginTop: ".55rem", opacity: 0.8 }}>
          Revenue: <b>{formatMoneyUsd(revenue)}</b>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   Main component
========================================================= */

export default function YearComparator({ filePath, year, baseYear, hotelFilter }: Props) {
  const tone = toneForHotel(hotelFilter);

  const { rows, loading, error } = useCsvClient(filePath);

  // filtros locales
  const [hofMode, setHofMode] = useState<"ALL" | "HISTORY" | "FORECAST">("ALL");
  const [quarter, setQuarter] = useState<0 | 1 | 2 | 3 | 4>(0);
  const [month, setMonth] = useState<number>(-1); // -1 => todos

  const keys = useMemo(() => Object.keys(rows?.[0] ?? {}), [rows]);

  // keys del CSV (robusto)
  const kEmpresa = useMemo(() => pickKey(keys, ["Empresa", "Hotel", "Property"]), [keys]);
  const kFecha = useMemo(() => pickKey(keys, ["Fecha", "Date"]), [keys]);
  const kHoF = useMemo(() => pickKey(keys, ["HoF", "Hof", "HOF"]), [keys]);

  const kOccPct = useMemo(() => pickKey(keys, ["Occ.%", "Occ %", "Occ%", "Occupancy"]), [keys]);
  const kOccRooms = useMemo(() => pickKey(keys, ["Total Occ.", "Total Occ", "Rooms Occupied", "Total Occu"]), [keys]);
  const kRev = useMemo(() => pickKey(keys, ["Room Revenue", "RoomRevenue", "Revenue"]), [keys]);

  const normalized: HfRow[] = useMemo(() => {
    if (!rows?.length) return [];

    const hfFilter = String(hotelFilter ?? "").trim();
    const target = hfFilter ? hfFilter.toUpperCase() : "";

    const out: HfRow[] = [];

    for (const r of rows as CsvRow[]) {
      const empresa = String(r[kEmpresa] ?? "").trim();
      if (!empresa) continue;

      // filtro exacto por Empresa (sin mezclar Sheratons)
      if (target && empresa.toUpperCase() !== target) continue;

      const d = parseDateSmart(r[kFecha]);
      if (!d) continue;

      const hof = String(r[kHoF] ?? "").trim() || "History";

      const yy = d.getFullYear();
      const mm = d.getMonth();
      const qq = quarterOfMonth(mm);
      const wd = d.getDay();

      const occPct01 = pct01(r[kOccPct]); // soporta "59,40%"
      const occRooms = num(r[kOccRooms]);
      const roomRevenue = num(r[kRev]);

      out.push({
        empresa,
        hof,
        date: d,
        year: yy,
        month: mm,
        quarter: qq,
        weekday: wd,
        occRooms,
        occPct: occPct01,
        roomRevenue,
      });
    }

    out.sort((a, b) => a.date.getTime() - b.date.getTime());
    return out;
  }, [rows, kEmpresa, kFecha, kHoF, kOccPct, kOccRooms, kRev, hotelFilter]);

  const filtered = useMemo(() => {
    const y = year;
    let list = normalized.filter((r) => r.year === y);

    if (hofMode !== "ALL") {
      const want = hofMode === "HISTORY" ? "history" : "forecast";
      list = list.filter((r) => String(r.hof).toLowerCase().includes(want));
    }

    if (quarter !== 0) list = list.filter((r) => r.quarter === quarter);
    if (month !== -1) list = list.filter((r) => r.month === month);

    return list;
  }, [normalized, year, hofMode, quarter, month]);

  const baseFiltered = useMemo(() => {
    const y = baseYear;
    let list = normalized.filter((r) => r.year === y);

    if (hofMode !== "ALL") {
      const want = hofMode === "HISTORY" ? "history" : "forecast";
      list = list.filter((r) => String(r.hof).toLowerCase().includes(want));
    }

    if (quarter !== 0) list = list.filter((r) => r.quarter === quarter);
    if (month !== -1) list = list.filter((r) => r.month === month);

    return list;
  }, [normalized, baseYear, hofMode, quarter, month]);

  const kpis = useMemo(() => {
    const a = emptyAgg("cur");
    for (const r of filtered) addAgg(a, r);
    const cur = finalizeAgg(a);

    const b = emptyAgg("base");
    for (const r of baseFiltered) addAgg(b, r);
    const base = finalizeAgg(b);

    return {
      cur,
      base,
      occDelta: deltaPct(cur.avgOcc, base.avgOcc),
      revDelta: deltaPct(cur.revenueTotal, base.revenueTotal),
      occRoomsDelta: deltaPct(cur.occRoomsTotal, base.occRoomsTotal),
    };
  }, [filtered, baseFiltered]);

  const aggByYear = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of normalized) {
      const key = String(r.year);
      const a = map.get(key) ?? emptyAgg(key);
      addAgg(a, r);
      map.set(key, a);
    }
    return Array.from(map.values())
      .map(finalizeAgg)
      .sort((a, b) => Number(a.key) - Number(b.key));
  }, [normalized]);

  const aggByQuarter = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of filtered) {
      const key = `Q${r.quarter}`;
      const a = map.get(key) ?? emptyAgg(key);
      addAgg(a, r);
      map.set(key, a);
    }
    return Array.from(map.values())
      .map(finalizeAgg)
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [filtered]);

  const aggByMonth = useMemo(() => {
    const map = new Map<string, Agg>();
    for (const r of filtered) {
      const key = `${r.month}`; // 0..11
      const a = map.get(key) ?? emptyAgg(key);
      addAgg(a, r);
      map.set(key, a);
    }
    return Array.from(map.values())
      .map((a) => ({ ...finalizeAgg(a), monthIdx: Number(a.key) }))
      .sort((a, b) => a.monthIdx - b.monthIdx);
  }, [filtered]);

  const monthRanking = useMemo(() => {
    const list = aggByMonth.map((a: any) => ({
      label: monthLong(a.monthIdx),
      occ: a.avgOcc,
      revenue: a.revenueTotal,
    }));
    return [...list].sort((a, b) => b.occ - a.occ).slice(0, 12);
  }, [aggByMonth]);

  const weekdayRanking = useMemo(() => {
    const map = new Map<number, Agg>();
    for (const r of filtered) {
      const a = map.get(r.weekday) ?? emptyAgg(String(r.weekday));
      addAgg(a, r);
      map.set(r.weekday, a);
    }
    const list = Array.from(map.entries()).map(([wd, a]) => {
      const f = finalizeAgg(a);
      return { wd, label: weekdayName(wd), occ: f.avgOcc, revenue: f.revenueTotal };
    });
    return list.sort((a, b) => b.occ - a.occ);
  }, [filtered]);

  const monthsInYear = useMemo(() => {
    const set = new Set<number>();
    for (const r of normalized) {
      if (r.year === year) set.add(r.month);
    }
    return Array.from(set.values()).sort((a, b) => a - b);
  }, [normalized, year]);

  const carouselItems = useMemo(() => {
    const cur = kpis.cur;
    const base = kpis.base;

    return [
      {
        label: "Ocupación promedio",
        value: formatPct01(cur.avgOcc),
        baseText: `Base ${baseYear}: ${formatPct01(base.avgOcc)}`,
        deltaText: `Δ ${(kpis.occDelta * 100).toFixed(1)}%`,
        delta: kpis.occDelta,
      },
      {
        label: "Revenue total",
        value: formatMoneyUsd(cur.revenueTotal),
        baseText: `Base ${baseYear}: ${formatMoneyUsd(base.revenueTotal)}`,
        deltaText: `Δ ${(kpis.revDelta * 100).toFixed(1)}%`,
        delta: kpis.revDelta,
      },
      {
        label: "Habitaciones ocupadas",
        value: formatInt(cur.occRoomsTotal),
        baseText: `Base ${baseYear}: ${formatInt(base.occRoomsTotal)}`,
        deltaText: `Δ ${(kpis.occRoomsDelta * 100).toFixed(1)}%`,
        delta: kpis.occRoomsDelta,
      },
    ];
  }, [kpis, baseYear]);

  if (loading) {
    return (
      <Card>
        <div style={{ fontWeight: 950 }}>Cargando History & Forecast…</div>
        <div style={{ opacity: 0.75, marginTop: ".35rem" }}>{filePath}</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div style={{ fontWeight: 950 }}>Error leyendo H&F</div>
        <div style={{ opacity: 0.85, marginTop: ".35rem" }}>{error}</div>
        <div style={{ opacity: 0.7, marginTop: ".5rem", fontSize: ".9rem" }}>{filePath}</div>
      </Card>
    );
  }

  if (!normalized.length) {
    return (
      <Card>
        <div style={{ fontWeight: 950 }}>Sin datos de H&F</div>
        <div style={{ opacity: 0.8, marginTop: ".35rem" }}>
          No se encontraron filas. Revisá que el CSV tenga columnas <b>Empresa</b> y <b>Fecha</b>.
        </div>
        <div style={{ opacity: 0.7, marginTop: ".5rem", fontSize: ".9rem" }}>
          Detectado: Empresa={kEmpresa || "—"} · Fecha={kFecha || "—"} · HoF={kHoF || "—"} · Occ%={kOccPct || "—"} · TotalOcc={kOccRooms || "—"} · Revenue={kRev || "—"}
        </div>
      </Card>
    );
  }

  const maxOccMonthSeries = Math.max(...aggByMonth.map((a: any) => a.avgOcc), 0.00001);
  const maxOccYear = Math.max(...aggByYear.map((a: any) => a.avgOcc), 0.00001);
  const maxOccQuarter = Math.max(...aggByQuarter.map((a: any) => a.avgOcc), 0.00001);
  const maxOccMonthRank = Math.max(...monthRanking.map((x) => x.occ), 0.00001);
  const maxOccWeekRank = Math.max(...weekdayRanking.map((x) => x.occ), 0.00001);

  return (
    <section className="section" style={{ display: "grid", gap: "1.25rem" }}>
      <SectionTitle
        title={`History & Forecast — ${hotelFilter ? hotelFilter : "Todos"} · ${year} vs ${baseYear}`}
        desc="KPIs + comparativa + series por Año/Trimestre/Mes + rankings por % ocupación (y revenue)."
        right={
          <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
            <Pill tone={tone === "gotel" ? "blue" : "red"} active={hofMode === "ALL"} onClick={() => setHofMode("ALL")}>
              Ambos
            </Pill>
            <Pill tone={tone === "gotel" ? "blue" : "red"} active={hofMode === "HISTORY"} onClick={() => setHofMode("HISTORY")}>
              History
            </Pill>
            <Pill tone={tone === "gotel" ? "blue" : "red"} active={hofMode === "FORECAST"} onClick={() => setHofMode("FORECAST")}>
              Forecast
            </Pill>
          </div>
        }
      />

      {/* Filtros locales */}
      <Card style={{ padding: ".85rem" }}>
        <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontWeight: 900, opacity: 0.85, marginRight: ".35rem" }}>Filtros:</div>

          <Pill tone={tone === "gotel" ? "blue" : "red"} active={quarter === 0} onClick={() => setQuarter(0)}>
            Trimestre · Todos
          </Pill>
          {[1, 2, 3, 4].map((q) => (
            <Pill key={q} tone={tone === "gotel" ? "blue" : "red"} active={quarter === q} onClick={() => setQuarter(q as any)}>
              Q{q}
            </Pill>
          ))}

          <div style={{ width: 10 }} />

          <Pill tone={tone === "gotel" ? "blue" : "red"} active={month === -1} onClick={() => setMonth(-1)}>
            Mes · Todos
          </Pill>
          {monthsInYear.map((m) => (
            <Pill key={m} tone={tone === "gotel" ? "blue" : "red"} active={month === m} onClick={() => setMonth(m)}>
              {monthName(m)}
            </Pill>
          ))}
        </div>
      </Card>

      {/* CAROUSEL: 1 SOLO GRANDE + auto */}
      <BigKpiCarousel tone={tone} items={carouselItems} intervalMs={4500} />

      {/* Comparativa principales indicadores (Ocupación / Revenue / Hab. ocupadas) */}
      <Card>
        <SectionTitle
          title="Comparativa principales indicadores"
          desc="Se calcula sobre el período filtrado del año seleccionado, comparado contra el mismo filtro aplicado al año base."
        />

        <div style={{ marginTop: ".85rem", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: ".85rem" }}>
          {[
            {
              label: "Ocupación promedio",
              value: formatPct01(kpis.cur.avgOcc),
              base: formatPct01(kpis.base.avgOcc),
              delta: kpis.occDelta,
            },
            {
              label: "Revenue total",
              value: formatMoneyUsd(kpis.cur.revenueTotal),
              base: formatMoneyUsd(kpis.base.revenueTotal),
              delta: kpis.revDelta,
            },
            {
              label: "Habitaciones ocupadas",
              value: formatInt(kpis.cur.occRoomsTotal),
              base: formatInt(kpis.base.occRoomsTotal),
              delta: kpis.occRoomsDelta,
            },
          ].map((b) => (
            <div
              key={b.label}
              style={{
                padding: "1rem",
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,.12)",
                background: "rgba(255,255,255,.04)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <div style={{ position: "absolute", inset: 0, background: gradMain(tone), opacity: 0.08 }} />
              <div style={{ position: "relative" }}>
                <div style={{ fontWeight: 900, opacity: 0.85 }}>{b.label}</div>
                <div style={{ fontSize: "1.55rem", fontWeight: 950, marginTop: ".25rem" }}>{b.value}</div>
                <div style={{ opacity: 0.78, marginTop: ".35rem" }}>
                  Base {baseYear}: {b.base} ·{" "}
                  <span style={{ fontWeight: 950, color: deltaColor(b.delta) }}>
                    Δ {(b.delta * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Serie por Año */}
      <Card>
        <SectionTitle title="Serie por Año (contexto del dataset)" desc="Promedio de ocupación por año (filtrado por hotel si corresponde)." />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".6rem" }}>
          {aggByYear.map((a: any) => (
            <BarRow
              key={a.key}
              label={a.key}
              subLeft={`Revenue: ${formatMoneyUsd(a.revenueTotal)} · Hab. ocupadas: ${formatInt(a.occRoomsTotal)}`}
              valueRight={formatPct01(a.avgOcc)}
              pctWidth={safeDiv(a.avgOcc, maxOccYear) * 100}
              tone={tone}
            />
          ))}
        </div>
      </Card>

      {/* H&F por Trimestre */}
      <Card>
        <SectionTitle title="History & Forecast por Trimestre" desc="Ocupación promedio por trimestre (respetando H/F y filtros aplicados)." />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".6rem" }}>
          {aggByQuarter.length ? (
            aggByQuarter.map((a: any) => (
              <BarRow
                key={a.key}
                label={a.key}
                subLeft={`Revenue: ${formatMoneyUsd(a.revenueTotal)} · Hab. ocupadas: ${formatInt(a.occRoomsTotal)}`}
                valueRight={formatPct01(a.avgOcc)}
                pctWidth={safeDiv(a.avgOcc, maxOccQuarter) * 100}
                tone={tone}
              />
            ))
          ) : (
            <div style={{ opacity: 0.8 }}>Sin datos con el filtro actual.</div>
          )}
        </div>
      </Card>

      {/* H&F por Mes (más “vivo”, no todo igual) */}
      <Card>
        <SectionTitle title="History & Forecast por Mes" desc="Meses en orden cronológico (respetando filtros actuales)." />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".65rem" }}>
          {aggByMonth.length ? (
            aggByMonth.map((a: any, idx: number) => {
              const isAlt = idx % 2 === 0;
              return (
                <div
                  key={a.key}
                  style={{
                    borderRadius: 18,
                    padding: ".75rem .85rem",
                    border: "1px solid rgba(255,255,255,.12)",
                    background: isAlt ? "rgba(255,255,255,.045)" : "rgba(255,255,255,.03)",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ position: "absolute", inset: 0, background: gradMain(tone), opacity: 0.06 }} />
                  <div style={{ position: "relative" }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: ".75rem" }}>
                      <div style={{ fontWeight: 950 }}>{monthLong(a.monthIdx)}</div>
                      <div style={{ marginLeft: "auto", fontWeight: 950 }}>{formatPct01(a.avgOcc)}</div>
                    </div>

                    <div style={{ marginTop: ".45rem", height: 10, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
                      <div style={{ width: `${safeDiv(a.avgOcc, maxOccMonthSeries) * 100}%`, height: "100%", background: gradBar(tone) }} />
                    </div>

                    <div style={{ marginTop: ".55rem", opacity: 0.82 }}>
                      Revenue: <b>{formatMoneyUsd(a.revenueTotal)}</b> · Hab. ocupadas: <b>{formatInt(a.occRoomsTotal)}</b>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div style={{ opacity: 0.8 }}>Sin datos con el filtro actual.</div>
          )}
        </div>
      </Card>

      {/* Ranking de meses */}
      <Card>
        <SectionTitle title="Ranking de Meses (por % ocupación)" desc="Ranking por ocupación promedio (no por recaudación contable). Incluye revenue total como referencia." />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".65rem" }}>
          {monthRanking.length ? (
            monthRanking.map((x, i) => (
              <RankRow
                key={x.label}
                tone={tone}
                rank={i + 1}
                label={x.label}
                occ={x.occ}
                revenue={x.revenue}
                maxOcc={maxOccMonthRank}
              />
            ))
          ) : (
            <div style={{ opacity: 0.8 }}>Sin datos con el filtro actual.</div>
          )}
        </div>
      </Card>

      {/* Ranking por día de semana */}
      <Card>
        <SectionTitle title="Ranking por Día de la Semana (por % ocupación)" desc="Para detectar qué día conviene empujar con estrategia comercial/operativa." />
        <div style={{ marginTop: ".85rem", display: "grid", gap: ".65rem" }}>
          {weekdayRanking.length ? (
            weekdayRanking.map((x, i) => (
              <RankRow
                key={x.label}
                tone={tone}
                rank={i + 1}
                label={x.label}
                occ={x.occ}
                revenue={x.revenue}
                maxOcc={maxOccWeekRank}
              />
            ))
          ) : (
            <div style={{ opacity: 0.8 }}>Sin datos con el filtro actual.</div>
          )}
        </div>
      </Card>

      {/* Diagnóstico */}
      <Card style={{ padding: ".85rem" }}>
        <div style={{ fontWeight: 900 }}>Diagnóstico</div>
        <div style={{ opacity: 0.78, marginTop: ".35rem", fontSize: ".92rem" }}>
          Filas CSV: <b>{rows.length}</b> · Filas normalizadas: <b>{normalized.length}</b> · Filas filtradas ({year}):{" "}
          <b>{filtered.length}</b>
        </div>
        <div style={{ opacity: 0.65, marginTop: ".35rem", fontSize: ".9rem" }}>
          Keys: Empresa=<b>{kEmpresa || "—"}</b> · Fecha=<b>{kFecha || "—"}</b> · HoF=<b>{kHoF || "—"}</b> ·
          Occ%=<b>{kOccPct || "—"}</b> · TotalOcc=<b>{kOccRooms || "—"}</b> · Revenue=<b>{kRev || "—"}</b>
        </div>
      </Card>
    </section>
  );
}
