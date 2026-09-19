"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Row = {
  year: number;
  continent: string;
  guests: number;
};

function safeNum(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function normContinent(s: any) {
  const v = (s ?? "").toString().trim();
  if (!v) return "Sin dato";
  if (/america/i.test(v)) return "América";
  if (/europa/i.test(v)) return "Europa";
  if (/asia/i.test(v)) return "Asia";
  if (/africa|áfrica/i.test(v)) return "África";
  if (/oceania|oceanía/i.test(v)) return "Oceanía";
  return v;
}

export default function WorldGuestsMap({
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

        const normalized: Row[] = rows.map((r: any) => ({
          year: Number(r["Año"] ?? r["Year"] ?? r.year ?? 0),
          continent: normContinent(r["Continente"]),
          guests: safeNum(r["Importe"] ?? r["Cantidad"] ?? r["Guests"] ?? 0),
        }));

        setRows(normalized.filter((x) => x.year && x.continent && x.guests));
      })
      .catch((e) => {
        console.error("WorldGuestsMap:", e);
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  const data = useMemo(() => {
    const map = new Map<string, number>();
    rows
      .filter((r) => r.year === year)
      .forEach((r) => map.set(r.continent, (map.get(r.continent) ?? 0) + r.guests));

    const items = Array.from(map.entries())
      .map(([continent, guests]) => ({ continent, guests }))
      .sort((a, b) => b.guests - a.guests);

    const total = items.reduce((acc, x) => acc + x.guests, 0);
    const max = items.length ? items[0].guests : 0;

    return { items, total, max };
  }, [rows, year]);

  if (loading) {
    return (
      <div className="card">
        <div className="cardTitle">Distribución global</div>
        <div className="cardNote">Cargando datos…</div>
      </div>
    );
  }

  if (!data.items.length) {
    return (
      <div className="card">
        <div className="cardTitle">Distribución global (por continentes)</div>
        <div className="cardNote" style={{ marginTop: ".8rem" }}>
          No hay datos para {year}.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="cardTitle">Distribución global (por continentes)</div>
      <div className="cardNote" style={{ marginTop: ".35rem" }}>
        Total {year}: <strong>{data.total.toLocaleString("es-AR")}</strong>
      </div>

      <div style={{ marginTop: ".9rem", display: "grid", gap: ".65rem" }}>
        {data.items.map((x) => {
          const share = data.total ? (x.guests / data.total) * 100 : 0;
          const w = data.max ? Math.max(8, (x.guests / data.max) * 100) : 0;

          return (
            <div key={x.continent} className="rankRow">
              <div className="rankLeft" style={{ minWidth: 0 }}>
                <div className="rankCountry">{x.continent}</div>
              </div>

              <div className="rankRight" style={{ justifyContent: "flex-end" }}>
                <div className="rankGuests">
                  {x.guests.toLocaleString("es-AR")} · {share.toFixed(1).replace(".", ",")}%
                </div>
                <div className="rankBarWrap">
                  <div className="rankBar" style={{ width: `${w}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

