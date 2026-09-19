// app/components/CountryRanking.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Props = {
  year: number;
  filePath: string;
  hotelFilter?: string; // Marriott fijo en tu caso (pero lo dejo opcional)
};

type Row = Record<string, any>;

const COUNTRY_TO_CODE: Record<string, string> = {
  ARGENTINA: "AR",
  BRASIL: "BR",
  BRAZIL: "BR",
  CHILE: "CL",
  URUGUAY: "UY",
  PARAGUAY: "PY",
  BOLIVIA: "BO",
  PERU: "PE",
  PERÚ: "PE",
  COLOMBIA: "CO",
  VENEZUELA: "VE",
  ECUADOR: "EC",
  MEXICO: "MX",
  MÉXICO: "MX",
  USA: "US",
  EEUU: "US",
  "ESTADOS UNIDOS": "US",
  CANADA: "CA",
  CANADÁ: "CA",
  ESPAÑA: "ES",
  SPAIN: "ES",
  ITALIA: "IT",
  ITALY: "IT",
  FRANCIA: "FR",
  FRANCE: "FR",
  ALEMANIA: "DE",
  GERMANY: "DE",
  "REINO UNIDO": "GB",
  "UNITED KINGDOM": "GB",
  INGLATERRA: "GB",
  PORTUGAL: "PT",
  CHINA: "CN",
  JAPON: "JP",
  JAPÓN: "JP",
  KOREA: "KR",
  "COREA DEL SUR": "KR",
  INDIA: "IN",
  AUSTRALIA: "AU",
  ISRAEL: "IL",
};

function norm(s: any): string {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
}

function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v).trim();
  if (!s) return 0;

  // puede venir "1.234" o "1.234,56"
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function formatInt(n: number): string {
  const x = Number.isFinite(n) ? n : 0;
  return Math.round(x).toLocaleString("es-AR");
}

function pickKey(keys: string[], candidates: string[]) {
  const kMap = new Map(keys.map((k) => [norm(k), k]));
  for (const c of candidates) {
    const hit = kMap.get(norm(c));
    if (hit) return hit;
  }
  return "";
}

function flagUrl(code2: string) {
  // flagcdn sin auth, muy liviano
  return `https://flagcdn.com/w40/${code2.toLowerCase()}.png`;
}

export default function CountryRanking({ year, filePath }: Props) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [sheetName, setSheetName] = useState<string>("");

  // ranking mensual: selector
  const [month, setMonth] = useState<number>(1);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    (async () => {
      try {
        const r: any = await readXlsxFromPublic(filePath);
        const sheet = r?.sheet ?? r?.sheetName ?? "";
        const data = (r?.rows ?? []) as Row[];

        if (!alive) return;
        setSheetName(String(sheet));
        setRows(data);
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo XLSX");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const keys = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);

  const kYear = useMemo(() => pickKey(keys, ["Año", "Ano", "Year"]), [keys]);
  const kCountry = useMemo(() => pickKey(keys, ["PAÍS", "PAIS", "Pais", "Country"]), [keys]);
  const kCont = useMemo(() => pickKey(keys, ["Continente", "Continent"]), [keys]);
  const kMonth = useMemo(() => pickKey(keys, ["N° Mes", "N°Mes", "Numero Mes", "Mes Num", "MonthNum"]), [keys]);
  const kValue = useMemo(() => pickKey(keys, ["Importe", "Cantidad", "Total", "Value"]), [keys]);

  const yearRows = useMemo(() => {
    if (!kYear) return [];
    return rows.filter((r) => toNumberSmart(r[kYear]) === year);
  }, [rows, kYear, year]);

  const totalValue = useMemo(() => {
    if (!kValue) return 0;
    return yearRows.reduce((acc, r) => acc + toNumberSmart(r[kValue]), 0);
  }, [yearRows, kValue]);

  const byCountry = useMemo(() => {
    const m = new Map<string, number>();
    if (!kCountry || !kValue) return m;

    for (const r of yearRows) {
      const c = norm(r[kCountry]);
      if (!c) continue;
      const v = toNumberSmart(r[kValue]);
      m.set(c, (m.get(c) ?? 0) + v);
    }
    return m;
  }, [yearRows, kCountry, kValue]);

  const byContinent = useMemo(() => {
    const m = new Map<string, number>();
    if (!kCont || !kValue) return m;

    for (const r of yearRows) {
      const c = norm(r[kCont]);
      if (!c) continue;
      const v = toNumberSmart(r[kValue]);
      m.set(c, (m.get(c) ?? 0) + v);
    }
    return m;
  }, [yearRows, kCont, kValue]);

  const topCountries = useMemo(() => {
    return Array.from(byCountry.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
  }, [byCountry]);

  const topContinents = useMemo(() => {
    return Array.from(byContinent.entries()).sort((a, b) => b[1] - a[1]);
  }, [byContinent]);

  const monthRows = useMemo(() => {
    if (!kMonth || !kYear) return [];
    return yearRows.filter((r) => toNumberSmart(r[kMonth]) === month);
  }, [yearRows, kMonth, kYear, month]);

  const byCountryMonth = useMemo(() => {
    const m = new Map<string, number>();
    if (!kCountry || !kValue) return m;

    for (const r of monthRows) {
      const c = norm(r[kCountry]);
      if (!c) continue;
      const v = toNumberSmart(r[kValue]);
      m.set(c, (m.get(c) ?? 0) + v);
    }
    return m;
  }, [monthRows, kCountry, kValue]);

  const topCountriesMonth = useMemo(() => {
    return Array.from(byCountryMonth.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
  }, [byCountryMonth]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando nacionalidades…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <b>Error:</b> {err}
      </div>
    );
  }

  if (!yearRows.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 900 }}>Sin datos para {year}.</div>
        <div style={{ opacity: 0.75, marginTop: ".25rem" }}>
          Archivo: {filePath}
          {sheetName ? ` · Sheet: ${sheetName}` : ""}
        </div>
        {keys.length ? (
          <div style={{ opacity: 0.75, marginTop: ".35rem", fontSize: ".9rem" }}>
            Keys ejemplo: {keys.slice(0, 10).join(", ")}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: "1rem" }}>
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Top países — {year}</div>
            <div style={{ opacity: 0.75, marginTop: ".15rem", fontSize: ".92rem" }}>
              Total {kValue || "valor"}: <b>{formatInt(totalValue)}</b>
            </div>
          </div>

          <div style={{ opacity: 0.7, fontSize: ".9rem" }}>
            {sheetName ? <>Sheet: <b>{sheetName}</b></> : null}
          </div>
        </div>

        <div style={{ display: "grid", gap: ".65rem", marginTop: ".85rem" }}>
          {topCountries.map(([country, val]) => {
            const pct = totalValue ? val / totalValue : 0;
            const code = COUNTRY_TO_CODE[country] || "";
            return (
              <div
                key={country}
                style={{
                  display: "grid",
                  gridTemplateColumns: "44px 1fr auto",
                  gap: ".75rem",
                  alignItems: "center",
                  padding: ".55rem .6rem",
                  borderRadius: 14,
                  border: "1px solid rgba(0,0,0,.06)",
                }}
              >
                <div style={{ width: 40, height: 28, borderRadius: 8, overflow: "hidden", background: "#f3f3f3" }}>
                  {code ? (
                    <img
                      src={flagUrl(code)}
                      alt={country}
                      width={40}
                      height={28}
                      style={{ width: 40, height: 28, objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{ width: 40, height: 28, display: "grid", placeItems: "center", fontSize: ".75rem" }}>
                      🌎
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gap: ".25rem" }}>
                  <div style={{ fontWeight: 900 }}>{country}</div>
                  <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,.06)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%`, height: 8, background: "rgba(160,0,0,.65)" }} />
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 950 }}>{(pct * 100).toFixed(1)}%</div>
                  <div style={{ opacity: 0.75, fontSize: ".92rem" }}>{formatInt(val)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Continentes */}
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Distribución por continente — {year}</div>

        <div style={{ display: "grid", gap: ".55rem", marginTop: ".75rem" }}>
          {topContinents.map(([cont, val]) => {
            const pct = totalValue ? val / totalValue : 0;
            return (
              <div
                key={cont}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: ".75rem",
                  alignItems: "center",
                  padding: ".55rem .6rem",
                  borderRadius: 14,
                  border: "1px solid rgba(0,0,0,.06)",
                }}
              >
                <div style={{ display: "grid", gap: ".25rem" }}>
                  <div style={{ fontWeight: 900 }}>{cont}</div>
                  <div style={{ height: 8, borderRadius: 999, background: "rgba(0,0,0,.06)", overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(0, Math.min(100, pct * 100))}%`, height: 8, background: "rgba(0,0,0,.35)" }} />
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 950 }}>{(pct * 100).toFixed(1)}%</div>
                  <div style={{ opacity: 0.75, fontSize: ".92rem" }}>{formatInt(val)}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Ranking por mes */}
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 950, fontSize: "1.05rem" }}>Ranking por mes — {year}</div>
            <div style={{ opacity: 0.75, marginTop: ".15rem", fontSize: ".92rem" }}>
              (Top 10 países del mes seleccionado)
            </div>
          </div>

          <label style={{ display: "grid", gap: ".35rem" }}>
            <div style={{ fontSize: ".8rem", opacity: 0.75, fontWeight: 800 }}>Mes</div>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              style={{
                borderRadius: 12,
                padding: ".55rem .6rem",
                border: "1px solid rgba(0,0,0,.12)",
                fontWeight: 900,
              }}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gap: ".65rem", marginTop: ".85rem" }}>
          {!topCountriesMonth.length ? (
            <div style={{ opacity: 0.8 }}>Sin datos para el mes {month}.</div>
          ) : (
            topCountriesMonth.map(([country, val]) => {
              const code = COUNTRY_TO_CODE[country] || "";
              return (
                <div
                  key={country}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "44px 1fr auto",
                    gap: ".75rem",
                    alignItems: "center",
                    padding: ".55rem .6rem",
                    borderRadius: 14,
                    border: "1px solid rgba(0,0,0,.06)",
                  }}
                >
                  <div style={{ width: 40, height: 28, borderRadius: 8, overflow: "hidden", background: "#f3f3f3" }}>
                    {code ? (
                      <img
                        src={flagUrl(code)}
                        alt={country}
                        width={40}
                        height={28}
                        style={{ width: 40, height: 28, objectFit: "cover" }}
                      />
                    ) : (
                      <div style={{ width: 40, height: 28, display: "grid", placeItems: "center", fontSize: ".75rem" }}>
                        🌎
                      </div>
                    )}
                  </div>

                  <div style={{ fontWeight: 900 }}>{country}</div>

                  <div style={{ textAlign: "right", fontWeight: 950 }}>{formatInt(val)}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
