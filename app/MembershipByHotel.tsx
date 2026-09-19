"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic } from "./xlsxClient";

type Row = {
  hotel: string;
  year: number;
  month: number;
  membership: string;
  qty: number;
};

function safeNum(v: any) {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function parseAnyDate(v: any): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date && !isNaN(v.getTime())) return v;

  if (typeof v === "number" && Number.isFinite(v)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + v * 86400000);
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(v ?? "").trim();
  if (!s) return null;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    let yy = Number(m[3]);
    if (yy < 100) yy += 2000;
    const d2 = new Date(yy, mm - 1, dd);
    return isNaN(d2.getTime()) ? null : d2;
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function pctDelta(cur: number, base: number) {
  if (!base) return null;
  return ((cur / base) - 1) * 100;
}

export default function MembershipByHotel({
  year,
  baseYear,
  filePath,
}: {
  year: number;
  baseYear: number;
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

        const parsed: Row[] = (rows ?? [])
          .map((r: any) => {
            const membership = (r.Bonboy ?? r.bonboy ?? r.Membership ?? "").toString().trim();
            const qty = safeNum(r.Cantidad ?? r.cantidad ?? r.Qty ?? 0);
            const hotel = (r.Empresa ?? r.empresa ?? r.Hotel ?? "").toString().trim();
            const d = parseAnyDate(r.Fecha ?? r.fecha ?? r.Date ?? "");

            if (!membership || !hotel || !d) return null;

            return {
              hotel,
              membership,
              qty,
              year: d.getFullYear(),
              month: d.getMonth() + 1,
            } as Row;
          })
          .filter(Boolean) as Row[];

        setRows(parsed);
      })
      .catch((e) => {
        console.error(e);
        setRows([]);
      })
      .finally(() => setLoading(false));

    return () => {
      alive = false;
    };
  }, [filePath]);

  const list = useMemo(() => {
    const sumFor = (yy: number) => {
      const map = new Map<string, number>();
      rows
        .filter((r) => r.year === yy)
        .forEach((r) => map.set(r.hotel, (map.get(r.hotel) ?? 0) + r.qty));
      return map;
    };

    const cur = sumFor(year);
    const base = sumFor(baseYear);

    // ✅ FIX VERCEL/TS: no spreads sobre iterators
    const hotels = Array.from(
      new Set([
        ...Array.from(cur.keys()),
        ...Array.from(base.keys()),
      ])
    );

    return hotels
      .map((h) => {
        const curVal = cur.get(h) ?? 0;
        const baseVal = base.get(h) ?? 0;
        const d = pctDelta(curVal, baseVal);
        return { hotel: h, cur: curVal, base: baseVal, deltaPct: d };
      })
      .sort((a, b) => b.cur - a.cur);
  }, [rows, year, baseYear]);

  if (loading) {
    return (
      <div className="card">
        <div className="cardTitle">Membership por hotel</div>
        <div className="cardNote">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="cardTitle">Membership por hotel</div>
      <div className="cardNote">{year} vs {baseYear}</div>

      <div style={{ marginTop: ".9rem", display: "grid", gap: ".6rem" }}>
        {list.map((x) => (
          <div key={x.hotel} style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
            <div style={{ fontWeight: 700 }}>{x.hotel}</div>
            <div style={{ display: "flex", gap: ".8rem", alignItems: "baseline" }}>
              <div style={{ fontWeight: 800 }}>{Math.round(x.cur).toLocaleString("es-AR")}</div>
              <div className={`delta ${x.deltaPct != null && x.deltaPct < 0 ? "down" : "up"}`} style={{ margin: 0 }}>
                {x.deltaPct == null ? "—" : `${x.deltaPct >= 0 ? "+" : ""}${x.deltaPct.toFixed(1).replace(".", ",")}%`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
