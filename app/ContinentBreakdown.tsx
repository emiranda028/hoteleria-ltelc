"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Row = {
  year: number;
  continent: string;
  value: number;
};

function safeNum(v: any) {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function ContinentBreakdown({
  year,
  filePath,
}: {
  year: number;
  filePath: string;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    readXlsxFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;

        const parsed: Row[] = rows
          .map((r: any) => {
            const yy = Number(r["Año"] ?? r.Anio ?? r.Year ?? 0);
            const cont = String(r.Continente ?? r.Continent ?? "").trim();
            const val = safeNum(r.Importe ?? r.Value ?? r.Guests ?? 0);
            if (!yy || !cont) return null;
            return { year: yy, continent: cont, value: val } as Row;
          })
          .filter(Boolean) as Row[];

        setRows(parsed);
      })
      .catch((e) => {
        console.error(e);
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => { alive = false; };
  }, [filePath]);

  const agg = useMemo(() => {
    const map = new Map<string, number>();
    rows
      .filter((r) => r.year === year)
      .forEach((r) => map.set(r.continent, (map.get(r.continent) ?? 0) + r.value));

    const list = Array.from(map.entries())
      .map(([continent, value]) => ({ continent, value }))
      .sort((a, b) => b.value - a.value);

    const total = list.reduce((s, x) => s + x.value, 0);
    return { list, total };
  }, [rows, year]);

  if (loading) {
    return (
      <div className="card">
        <div className="cardTitle">Por continente</div>
        <div className="cardNote">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: "1rem" }}>
      <div className="cardTitle">Huéspedes por continente</div>
      <div className="cardNote">Año {year} · Distribución</div>

      <div style={{ marginTop: ".8rem", display: "grid", gap: ".55rem" }}>
        {agg.list.slice(0, 6).map((x) => {
          const pct = agg.total > 0 ? (x.value / agg.total) * 100 : 0;
          return (
            <div
              key={x.continent}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                gap: ".75rem",
              }}
            >
              <div style={{ fontWeight: 800 }}>{x.continent}</div>
              <div style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                {pct.toFixed(1).replace(".", ",")}%
              </div>

              <div style={{ gridColumn: "1 / -1", height: 8, background: "rgba(148,163,184,.22)", borderRadius: 999 }}>
                <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", borderRadius: 999, background: "rgba(59,130,246,.65)" }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
