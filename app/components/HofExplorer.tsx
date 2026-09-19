"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readCsvFromPublic, toNumberSmart, safeDiv, toPercent01, formatMoney, formatPct } from "./useCsvClient";

type AnyRow = Record<string, any>;

type HofRow = {
  Empresa?: string;
  HoF?: string; // "History" | "Forecast"
  Fecha?: string; // puede venir como texto
  "Occ.%"?: any;
  "Room Revenue"?: any;
  "Average Rate"?: any;
  "Arr.\nRooms"?: any;
  "Dep.\nRooms"?: any;
  "Total\nOcc."?: any;
  "OOO\nRooms"?: any;
  [k: string]: any;
};

type Props = {
  year: number;
  filePath: string;
  hotelFilter: string; // "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI" etc.
};

function normStr(v: any): string {
  return String(v ?? "").trim().toUpperCase();
}

function tryParseDate(v: any): Date | null {
  if (!v) return null;

  // Si ya es Date
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  const s = String(v).trim();

  // formatos típicos: "1/6/2022" (d/m/yyyy) o "01-06-22 Wed"
  // 1) dd/mm/yyyy
  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    let yy = Number(m1[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // 2) dd-mm-yy ...
  const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})/);
  if (m2) {
    const dd = Number(m2[1]);
    const mm = Number(m2[2]);
    let yy = Number(m2[3]);
    if (yy < 100) yy += 2000;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // 3) fallback Date.parse
  const t = Date.parse(s);
  if (!isNaN(t)) return new Date(t);

  return null;
}

function monthKey(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}`;
}

const MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function prettyMonth(k: string): string {
  // "2025-06"
  const [yy, mm] = k.split("-");
  const idx = Number(mm) - 1;
  return `${MONTHS_ES[idx] ?? mm} ${yy}`;
}

export default function HofExplorer({ year, filePath, hotelFilter }: Props) {
  const [loading, setLoading] = useState<boolean>(true);
  const [err, setErr] = useState<string>("");
  const [rows, setRows] = useState<HofRow[]>([]);
  const [hofMode, setHofMode] = useState<"History" | "Forecast" | "ALL">("ALL");
  const [monthSel, setMonthSel] = useState<string>("");

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setErr("");

    readCsvFromPublic(filePath)
      .then((r: any) => {
        if (!alive) return;

        // soporta ambos contratos: {rows} o array directo
        const raw: AnyRow[] = Array.isArray(r) ? r : (r?.rows ?? []);
        const normalized = (raw ?? []).map((x) => x as HofRow);

        setRows(normalized);
        setLoading(false);
      })
      .catch((e: any) => {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo CSV");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  // Filtrado por hotel + año + HoF
  const filtered = useMemo(() => {
    const hf = normStr(hotelFilter);

    const out = rows
      .map((r) => {
        const d = tryParseDate(r.Fecha ?? r.Date ?? r["Importe Date"] ?? r["Date"]);
        return { r, d };
      })
      .filter(({ r, d }) => {
        if (!d) return false;

        // hotel
        const empresa = normStr(r.Empresa ?? r.Hotel ?? r.empresa ?? r.hotel);
        if (hf && empresa !== hf) return false;

        // año
        if (d.getFullYear() !== year) return false;

        // HoF
        if (hofMode !== "ALL") {
          const v = normStr(r.HoF ?? r.HOF ?? r.hof);
          if (v !== normStr(hofMode)) return false;
        }

        return true;
      })
      .sort((a, b) => (a.d!.getTime() - b.d!.getTime()))
      .map(({ r, d }) => ({ ...r, __date: d! }));

    return out as (HofRow & { __date: Date })[];
  }, [rows, hotelFilter, year, hofMode]);

  // Meses disponibles
  const months = useMemo(() => {
    const set = new Set<string>();
    filtered.forEach((r: any) => {
      const d: Date = r.__date;
      set.add(monthKey(d));
    });
    return Array.from(set).sort();
  }, [filtered]);

  // Seteo automático del mes cuando cambia filtro
  useEffect(() => {
    if (!months.length) {
      setMonthSel("");
      return;
    }
    // si el mes actual ya no existe, tomamos el último
    if (!monthSel || !months.includes(monthSel)) {
      setMonthSel(months[months.length - 1]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months.join("|")]);

  const monthRows = useMemo(() => {
    if (!monthSel) return filtered;
    return filtered.filter((r: any) => monthKey(r.__date) === monthSel);
  }, [filtered, monthSel]);

  // KPIs del mes seleccionado
  const kpis = useMemo(() => {
    const sumRoomRev = monthRows.reduce((acc, r) => acc + toNumberSmart(r["Room Revenue"]), 0);

    // Occ.% puede venir como 0.594 o "59,40%" o 59.4
    // Promediamos ponderado por Rooms Occupied si existiera; si no, promedio simple
    const occVals = monthRows.map((r) => toPercent01(toNumberSmart(r["Occ.%"])));
    const occAvg = occVals.length ? occVals.reduce((a, b) => a + b, 0) / occVals.length : 0;

    // ADR: si viene "Average Rate" diario, promedio simple
    const adrVals = monthRows.map((r) => toNumberSmart(r["Average Rate"]));
    const adrAvg = adrVals.length ? adrVals.reduce((a, b) => a + b, 0) / adrVals.length : 0;

    return {
      roomRevenue: sumRoomRev,
      occ: occAvg,
      adr: adrAvg,
    };
  }, [monthRows]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando H&F…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Error: {err}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Sin datos (archivo vacío o no cargó).
      </div>
    );
  }

  if (!filtered.length) {
    // debug rápido para que no te vuelva loco:
    const empresas = Array.from(new Set(rows.map((r) => normStr(r.Empresa ?? r.Hotel)))).filter(Boolean).slice(0, 20);
    const years = Array.from(
      new Set(
        rows
          .map((r) => tryParseDate((r as any).Fecha)?.getFullYear())
          .filter((x) => typeof x === "number") as number[]
      )
    )
      .sort()
      .slice(0, 50);

    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 800 }}>Sin filas H&F para el filtro actual.</div>
        <div style={{ marginTop: ".5rem", opacity: 0.9 }}>
          Chequeá:
          <ul style={{ marginTop: ".35rem" }}>
            <li>
              <b>hotelFilter</b>: {String(hotelFilter)}
            </li>
            <li>
              <b>year</b>: {year}
            </li>
            <li>
              <b>HoF</b>: {hofMode}
            </li>
          </ul>
        </div>

        <div style={{ marginTop: ".75rem", fontSize: ".95rem" }}>
          <div style={{ opacity: 0.85 }}>
            <b>Empresas detectadas</b>: {empresas.join(", ") || "—"}
          </div>
          <div style={{ opacity: 0.85, marginTop: ".25rem" }}>
            <b>Años detectados</b>: {years.join(", ") || "—"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: ".85rem", display: "grid", gap: ".75rem" }}>
      {/* Controles */}
      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", alignItems: "center" }}>
        <div className="card" style={{ padding: ".5rem .75rem", borderRadius: 14 }}>
          <b>Mes</b>
          <div style={{ marginTop: ".35rem" }}>
            <select
              value={monthSel}
              onChange={(e) => setMonthSel(e.target.value)}
              style={{ padding: ".35rem .5rem", borderRadius: 10 }}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {prettyMonth(m)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="card" style={{ padding: ".5rem .75rem", borderRadius: 14 }}>
          <b>HoF</b>
          <div style={{ marginTop: ".35rem", display: "flex", gap: ".35rem", flexWrap: "wrap" }}>
            {(["ALL", "History", "Forecast"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setHofMode(k)}
                className="chip"
                style={{
                  padding: ".35rem .6rem",
                  borderRadius: 999,
                  border: "1px solid rgba(0,0,0,.15)",
                  background: hofMode === k ? "rgba(0,0,0,.06)" : "transparent",
                  fontWeight: 800,
                }}
              >
                {k === "ALL" ? "Todo" : k}
              </button>
            ))}
          </div>
        </div>

        <div className="card" style={{ padding: ".5rem .75rem", borderRadius: 14 }}>
          <b>Filas</b>
          <div style={{ marginTop: ".35rem", opacity: 0.9 }}>{monthRows.length}</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: ".65rem" }}>
        <div className="card" style={{ padding: ".85rem", borderRadius: 18 }}>
          <div style={{ opacity: 0.75, fontSize: ".9rem" }}>Room Revenue</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>{formatMoney(kpis.roomRevenue)}</div>
        </div>

        <div className="card" style={{ padding: ".85rem", borderRadius: 18 }}>
          <div style={{ opacity: 0.75, fontSize: ".9rem" }}>Ocupación (prom.)</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>{formatPct(kpis.occ)}</div>
        </div>

        <div className="card" style={{ padding: ".85rem", borderRadius: 18 }}>
          <div style={{ opacity: 0.75, fontSize: ".9rem" }}>ADR (prom.)</div>
          <div style={{ fontSize: "1.25rem", fontWeight: 950 }}>{formatMoney(kpis.adr)}</div>
        </div>
      </div>

      {/* Tabla simple */}
      <div className="card" style={{ padding: "1rem", borderRadius: 18, overflowX: "auto" }}>
        <div style={{ fontWeight: 950, marginBottom: ".6rem" }}>Detalle diario</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: ".92rem" }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid rgba(0,0,0,.12)" }}>
              <th style={{ padding: ".35rem .25rem" }}>Fecha</th>
              <th style={{ padding: ".35rem .25rem" }}>HoF</th>
              <th style={{ padding: ".35rem .25rem" }}>Occ.%</th>
              <th style={{ padding: ".35rem .25rem" }}>Room Rev</th>
              <th style={{ padding: ".35rem .25rem" }}>ADR</th>
            </tr>
          </thead>
          <tbody>
            {monthRows.slice(0, 62).map((r: any, idx) => {
              const d: Date = r.__date;
              const occ = toPercent01(toNumberSmart(r["Occ.%"]));
              const rr = toNumberSmart(r["Room Revenue"]);
              const adr = toNumberSmart(r["Average Rate"]);
              const hof = String(r.HoF ?? "");
              return (
                <tr key={idx} style={{ borderBottom: "1px solid rgba(0,0,0,.06)" }}>
                  <td style={{ padding: ".35rem .25rem" }}>
                    {d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" })}
                  </td>
                  <td style={{ padding: ".35rem .25rem" }}>{hof}</td>
                  <td style={{ padding: ".35rem .25rem" }}>{formatPct(occ)}</td>
                  <td style={{ padding: ".35rem .25rem" }}>{formatMoney(rr)}</td>
                  <td style={{ padding: ".35rem .25rem" }}>{formatMoney(adr)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {monthRows.length > 62 && (
          <div style={{ marginTop: ".6rem", opacity: 0.7, fontSize: ".9rem" }}>
            Mostrando 62 filas (por performance). Total en el mes: {monthRows.length}.
          </div>
        )}
      </div>
    </div>
  );
}
