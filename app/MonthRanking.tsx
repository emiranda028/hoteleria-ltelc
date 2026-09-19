"use client";

import { useMemo } from "react";
import { toNumberSmart, toPercent01, formatPct, safeDiv } from "./useCsvClient";

type AnyRow = Record<string, any>;

export type HofMode = "ALL" | "H" | "F"; // History / Forecast

type Props = {
  rows: AnyRow[];
  year: number;
  baseYear: number;
  hotelFilter?: string; // "" => todos
  hofMode?: HofMode; // "ALL" por default
  title?: string;
};

type MonthAgg = {
  year: number;
  month: number; // 1-12
  label: string; // "Ene", "Feb"...
  days: number;
  occSum01: number; // suma de occ% (0-1) día a día
  occAvg01: number; // promedio simple
};

type DowAgg = {
  dowIndex: number; // 1=lun ... 7=dom
  label: string;
  days: number;
  occSum01: number;
  occAvg01: number;
};

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const DOW_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function isFiniteDate(d: any): d is Date {
  return d instanceof Date && !isNaN(d.getTime());
}

/**
 * Parse robusto de fecha:
 * - Prefiere row["Fecha"], si no row["Date"]
 * - Soporta:
 *   - "2022-06-01"
 *   - "1/6/2022"
 *   - "01-06-22 Wed" (toma el primer token y lo intenta)
 *   - serial Excel (>= 20000 aprox)
 */
function parseDateSmart(row: AnyRow): Date | null {
  const raw = row?.Fecha ?? row?.Date ?? row?.DATE ?? row?.FECHA ?? null;
  if (raw === null || raw === undefined || raw === "") return null;

  // Excel serial (días desde 1899-12-30 normalmente)
  if (typeof raw === "number") {
    // Heurística: si es muy grande, probablemente serial
    if (raw > 1000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const ms = raw * 24 * 60 * 60 * 1000;
      const d = new Date(excelEpoch.getTime() + ms);
      return isFiniteDate(d) ? d : null;
    }
    return null;
  }

  if (typeof raw === "string") {
    const s = raw.trim();

    // Si viene tipo "01-06-22 Wed" quedate con "01-06-22"
    const firstToken = s.split(/\s+/)[0];

    // ISO
    const isoTry = new Date(s);
    if (isFiniteDate(isoTry)) return isoTry;

    const isoTry2 = new Date(firstToken);
    if (isFiniteDate(isoTry2)) return isoTry2;

    // dd/mm/yyyy o d/m/yyyy
    const m1 = firstToken.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (m1) {
      const dd = Number(m1[1]);
      const mm = Number(m1[2]);
      let yy = Number(m1[3]);
      if (yy < 100) yy += 2000;
      const d = new Date(yy, mm - 1, dd);
      return isFiniteDate(d) ? d : null;
    }

    // Si es un número en string (serial)
    const asNum = Number(s.replace(",", "."));
    if (!isNaN(asNum) && asNum > 1000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const d = new Date(excelEpoch.getTime() + asNum * 24 * 60 * 60 * 1000);
      return isFiniteDate(d) ? d : null;
    }

    return null;
  }

  return null;
}

function normalizeHotel(v: any): string {
  return String(v ?? "").trim().toUpperCase();
}

function normalizeHof(v: any): "H" | "F" | "" {
  const s = String(v ?? "").trim().toUpperCase();
  if (s.startsWith("H")) return "H";
  if (s.startsWith("F")) return "F";
  return "";
}

/** Devuelve Occ.% como fracción 0..1 */
function readOcc01(row: AnyRow): number {
  // preferir key exacta si existe
  const v = row?.["Occ.%"] ?? row?.["Occ%"] ?? row?.["OCC.%"] ?? row?.["OCC%"] ?? row?.["Occupancy"] ?? row?.["Ocupación"];
  const n = toNumberSmart(v);
  // si viene "59,40%" -> toNumberSmart => 59.4, convertimos a 0.594
  // si viene 0.594 ya queda
  return toPercent01(n);
}

function monthKey(y: number, m: number) {
  return `${y}-${String(m).padStart(2, "0")}`;
}

function getDowIndexMondayFirst(d: Date): number {
  // JS: 0=domingo ... 6=sábado
  const js = d.getDay();
  // Queremos 1=lun ... 7=dom
  if (js === 0) return 7;
  return js; // 1..6
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
      <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>{title}</div>
      <div style={{ marginTop: ".75rem" }}>{children}</div>
    </div>
  );
}

export default function MonthRanking({
  rows,
  year,
  baseYear,
  hotelFilter = "",
  hofMode = "ALL",
  title = "Ranking por mes (por % de ocupación)",
}: Props) {
  const filtered = useMemo(() => {
    const wantHotel = normalizeHotel(hotelFilter);
    return (rows ?? []).filter((r) => {
      const hotel = normalizeHotel(r?.Empresa ?? r?.Hotel ?? r?.empresa ?? r?.hotel);
      if (wantHotel && hotel !== wantHotel) return false;

      if (hofMode !== "ALL") {
        const hof = normalizeHof(r?.HoF ?? r?.Hof ?? r?.hof);
        if (hof !== hofMode) return false;
      }

      const d = parseDateSmart(r);
      if (!d) return false;

      const y = d.getFullYear();
      return y === year || y === baseYear;
    });
  }, [rows, hotelFilter, hofMode, year, baseYear]);

  const { monthAggYear, monthAggBase, dowAggYear, dowAggBase } = useMemo(() => {
    const byMonthY = new Map<string, MonthAgg>();
    const byMonthB = new Map<string, MonthAgg>();
    const byDowY = new Map<number, DowAgg>();
    const byDowB = new Map<number, DowAgg>();

    for (const r of filtered) {
      const d = parseDateSmart(r);
      if (!d) continue;

      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const occ01 = readOcc01(r);

      const targetMonthMap = y === year ? byMonthY : byMonthB;
      const mk = monthKey(y, m);
      const prevM =
        targetMonthMap.get(mk) ??
        ({
          year: y,
          month: m,
          label: MONTHS_ES[m - 1] ?? String(m),
          days: 0,
          occSum01: 0,
          occAvg01: 0,
        } as MonthAgg);

      prevM.days += 1;
      prevM.occSum01 += occ01;
      prevM.occAvg01 = safeDiv(prevM.occSum01, prevM.days);
      targetMonthMap.set(mk, prevM);

      const dow = getDowIndexMondayFirst(d); // 1..7
      const targetDowMap = y === year ? byDowY : byDowB;
      const prevD =
        targetDowMap.get(dow) ??
        ({
          dowIndex: dow,
          label: DOW_ES[dow - 1] ?? String(dow),
          days: 0,
          occSum01: 0,
          occAvg01: 0,
        } as DowAgg);

      prevD.days += 1;
      prevD.occSum01 += occ01;
      prevD.occAvg01 = safeDiv(prevD.occSum01, prevD.days);
      targetDowMap.set(dow, prevD);
    }

    // a arrays
    const monthAggYearArr = Array.from(byMonthY.values());
    const monthAggBaseArr = Array.from(byMonthB.values());

    const dowAggYearArr = Array.from(byDowY.values()).sort((a, b) => a.dowIndex - b.dowIndex);
    const dowAggBaseArr = Array.from(byDowB.values()).sort((a, b) => a.dowIndex - b.dowIndex);

    // ordenar ranking por ocupación (desc)
    monthAggYearArr.sort((a, b) => b.occAvg01 - a.occAvg01);

    // base: lo dejamos por mes natural (1..12) para lookup fácil
    monthAggBaseArr.sort((a, b) => a.month - b.month);

    return {
      monthAggYear: monthAggYearArr,
      monthAggBase: monthAggBaseArr,
      dowAggYear: dowAggYearArr,
      dowAggBase: dowAggBaseArr,
    };
  }, [filtered, year, baseYear]);

  const baseByMonth = useMemo(() => {
    const m = new Map<number, MonthAgg>();
    for (const a of monthAggBase) m.set(a.month, a);
    return m;
  }, [monthAggBase]);

  const baseByDow = useMemo(() => {
    const m = new Map<number, DowAgg>();
    for (const a of dowAggBase) m.set(a.dowIndex, a);
    return m;
  }, [dowAggBase]);

  const hasAny = monthAggYear.length > 0;

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <Card title={title}>
        {!hasAny ? (
          <div style={{ opacity: 0.85 }}>
            Sin datos para el filtro actual (hotel="{hotelFilter || "Todos"}", HoF="{hofMode}", año {year} / base {baseYear}).
          </div>
        ) : (
          <div style={{ display: "grid", gap: ".75rem" }}>
            <div style={{ opacity: 0.85 }}>
              Ordenado por <b>% Ocupación</b> (Occ.% promedio diario). Comparativa vs {baseYear} por mes.
            </div>

            <div style={{ display: "grid", gap: ".5rem" }}>
              {monthAggYear.map((m) => {
                const b = baseByMonth.get(m.month);
                const delta = (m.occAvg01 ?? 0) - (b?.occAvg01 ?? 0);

                return (
                  <div
                    key={`${m.year}-${m.month}`}
                    className="card"
                    style={{
                      padding: ".65rem .75rem",
                      borderRadius: 14,
                      display: "grid",
                      gap: ".35rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "baseline" }}>
                      <div style={{ fontWeight: 900 }}>
                        {m.label} {year}
                      </div>
                      <div style={{ fontWeight: 950 }}>{formatPct(m.occAvg01)}</div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", fontSize: ".95rem", opacity: 0.9 }}>
                      <div>
                        Base {baseYear}: <b>{b ? formatPct(b.occAvg01) : "—"}</b>
                      </div>
                      <div style={{ fontWeight: 900 }}>
                        Δ {delta >= 0 ? "+" : ""}
                        {formatPct(Math.abs(delta)).replace("%", " pp")}
                      </div>
                    </div>

                    {/* barra simple */}
                    <div style={{ height: 10, borderRadius: 999, background: "rgba(0,0,0,.08)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, m.occAvg01 * 100))}%`, height: "100%" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <Card title="Ranking por día de la semana (por % de ocupación)">
        {!hasAny ? (
          <div style={{ opacity: 0.85 }}>Sin datos para calcular ranking por día.</div>
        ) : (
          <div style={{ display: "grid", gap: ".65rem" }}>
            <div style={{ opacity: 0.85 }}>
              Promedio diario de <b>Occ.%</b> por día. Comparativa vs {baseYear}.
            </div>

            <div style={{ display: "grid", gap: ".5rem" }}>
              {dowAggYear.map((d) => {
                const b = baseByDow.get(d.dowIndex);
                const delta = (d.occAvg01 ?? 0) - (b?.occAvg01 ?? 0);

                return (
                  <div
                    key={d.dowIndex}
                    className="card"
                    style={{
                      padding: ".65rem .75rem",
                      borderRadius: 14,
                      display: "grid",
                      gap: ".35rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "baseline" }}>
                      <div style={{ fontWeight: 900 }}>{d.label}</div>
                      <div style={{ fontWeight: 950 }}>{formatPct(d.occAvg01)}</div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", fontSize: ".95rem", opacity: 0.9 }}>
                      <div>
                        Base {baseYear}: <b>{b ? formatPct(b.occAvg01) : "—"}</b>
                      </div>
                      <div style={{ fontWeight: 900 }}>
                        Δ {delta >= 0 ? "+" : ""}
                        {formatPct(Math.abs(delta)).replace("%", " pp")}
                      </div>
                    </div>

                    <div style={{ height: 10, borderRadius: 999, background: "rgba(0,0,0,.08)", overflow: "hidden" }}>
                      <div style={{ width: `${Math.max(0, Math.min(100, d.occAvg01 * 100))}%`, height: "100%" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
