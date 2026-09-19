"use client";

import { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic, XlsxRow } from "./xlsxClient";
import { toNumberSmart } from "./useCsvClient";

type Props = {
  year: number;
  baseYear: number;
  filePath: string;

  /** "" => todos */
  hotelFilter: string;

  /** si lo pasás, limita hoteles válidos (por ej JCR) */
  allowedHotels?: string[];

  /** si querés compacto */
  compactCharts?: boolean;
};

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

  for (const c of candidates) {
    const cn = normKey(c);
    const hit = K.find((x) => x.n === cn);
    if (hit) return hit.raw;
  }
  for (const c of candidates) {
    const cn = normKey(c);
    const hit = K.find((x) => x.n.includes(cn));
    if (hit) return hit.raw;
  }
  return "";
}

/**
 * Soporta:
 * - Date
 * - string dd/mm/yyyy
 * - Date.parse
 * - Excel serial number (XLSX)
 */
function parseDateAny(v: any): Date | null {
  if (v === null || v === undefined || v === "") return null;

  // Excel serial date (muy común en XLSX)
  if (typeof v === "number" && isFinite(v)) {
    // base estándar práctica: 1899-12-30
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const ms = v * 24 * 60 * 60 * 1000;
    const d = new Date(excelEpoch.getTime() + ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (v instanceof Date) return v;

  const s = String(v).trim();
  if (!s) return null;

  const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m1) {
    const dd = Number(m1[1]);
    const mm = Number(m1[2]);
    const yy = Number(m1[3]);
    const d = new Date(yy, mm - 1, dd);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);

  return null;
}

function memColor(name: string): string {
  const s = String(name ?? "").toLowerCase();

  if (s.includes("gold")) return "#D4AF37"; // oro
  if (s.includes("platinum")) return "#C0C0C0"; // plata
  if (s.includes("silver")) return "#B0B0B0";
  if (s.includes("titanium")) return "#7A7A7A";
  if (s.includes("ambassador")) return "#4FA3FF"; // celeste
  if (s.includes("member")) return "#8A8A8A";
  if (s.includes("other") || s.includes("otros")) return "#666";
  return "#888";
}

function formatInt(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}

export default function MembershipSummary({
  year,
  baseYear,
  filePath,
  hotelFilter,
  allowedHotels = [],
  compactCharts = false,
}: Props) {
  const [rows, setRows] = useState<XlsxRow[]>([]);
  const [sheet, setSheet] = useState<string>("");
  const [keysDetected, setKeysDetected] = useState<{
    kHotel: string;
    kMem: string;
    kQty: string;
    kFecha: string;
  }>({
    kHotel: "",
    kMem: "",
    kQty: "",
    kFecha: "",
  });

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    readXlsxFromPublic(filePath)
      .then((r) => {
        if (!alive) return;
        setSheet(r.sheetName ?? "");
        setRows((r.rows ?? []) as XlsxRow[]);
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setErr(e?.message ?? "Error leyendo XLSX");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  useEffect(() => {
    if (!rows.length) return;

    const keys = Object.keys(rows[0] ?? {});
    const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
    const kMem = pickKey(keys, ["Bonboy", "Membership", "Membresia", "Membresía"]);
    const kQty = pickKey(keys, ["Cantidad", "Qty", "Quantity", "Guests", "Pax"]);
    const kFecha = pickKey(keys, ["Fecha", "Date"]);

    setKeysDetected({ kHotel, kMem, kQty, kFecha });
  }, [rows]);

  const filtered = useMemo(() => {
    const { kHotel, kMem, kQty, kFecha } = keysDetected;
    if (!rows.length || !kMem || !kQty) return [];

    const hf = String(hotelFilter ?? "").trim();
    const allowSet = new Set((allowedHotels ?? []).map((x) => String(x).trim()).filter(Boolean));

    return rows
      .map((r) => {
        const emp = String(r[kHotel] ?? "").trim();
        const mem = String(r[kMem] ?? "").trim();
        const qty = toNumberSmart(r[kQty]);
        const d = parseDateAny(r[kFecha]);
        const yy = d ? d.getFullYear() : null;

        return { emp, mem, qty, yy };
      })
      .filter((x) => x.mem && x.qty >= 0)
      .filter((x) => (x.yy ? x.yy === year : false)) // si no puedo leer año, afuera
      .filter((x) => {
        if (allowSet.size > 0 && !allowSet.has(x.emp)) return false;
        return true;
      })
      .filter((x) => {
        if (!hf) return true;
        return x.emp === hf; // exact match
      });
  }, [rows, keysDetected, year, hotelFilter, allowedHotels]);

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    for (const x of filtered) {
      map.set(x.mem, (map.get(x.mem) ?? 0) + x.qty);
    }

    const items = Array.from(map.entries())
      .map(([mem, qty]) => ({ mem, qty }))
      .sort((a, b) => b.qty - a.qty);

    const total = items.reduce((acc, it) => acc + it.qty, 0);

    return { items, total };
  }, [filtered]);

  const title = useMemo(() => {
    const h = hotelFilter ? hotelFilter : "JCR (Todos)";
    return `Membership — ${h} · ${year} (acumulado)`;
  }, [hotelFilter, year]);

  if (loading) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Cargando Membership…
      </div>
    );
  }

  if (err) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        Error Membership: {err}
      </div>
    );
  }

  if (!totals.items.length) {
    return (
      <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>
        <div style={{ fontWeight: 950 }}>{title}</div>
        <div style={{ opacity: 0.8, marginTop: ".35rem" }}>Sin datos para este filtro.</div>
        <div style={{ opacity: 0.7, marginTop: ".5rem", fontSize: ".9rem" }}>
          Sheet: {sheet || "—"} · Detectado: hotel={keysDetected.kHotel || "—"} · membership={keysDetected.kMem || "—"} ·
          qty={keysDetected.kQty || "—"} · fecha={keysDetected.kFecha || "—"}
          {allowedHotels?.length ? ` · allowedHotels=${allowedHotels.join(", ")}` : ""}
          {hotelFilter ? ` · filtroHotel=${hotelFilter}` : ""}
        </div>
      </div>
    );
  }

  const max = Math.max(...totals.items.map((x) => x.qty), 1);

  return (
    <section className="section" id="membership">
      <div className="sectionTitle" style={{ fontSize: "1.25rem", fontWeight: 950 }}>
        {title}
      </div>

      <div className="sectionDesc" style={{ marginTop: ".35rem", opacity: 0.85 }}>
        Total:{" "}
        <span style={{ fontSize: "1.75rem", fontWeight: 950, marginLeft: ".35rem" }}>
          {formatInt(totals.total)}
        </span>
      </div>

      <div
        className="card"
        style={{
          padding: compactCharts ? ".85rem" : "1rem",
          borderRadius: 18,
          marginTop: ".85rem",
        }}
      >
        <div style={{ display: "grid", gap: ".55rem" }}>
          {totals.items.map((it) => {
            const w = Math.round((it.qty / max) * 100);
            const color = memColor(it.mem);
            return (
              <div
                key={it.mem}
                style={{
                  display: "grid",
                  gridTemplateColumns: "220px 1fr 90px",
                  gap: ".75rem",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 850 }}>{it.mem}</div>

                <div style={{ height: 12, borderRadius: 999, background: "rgba(255,255,255,.10)", overflow: "hidden" }}>
                  <div
                    style={{
                      width: `${w}%`,
                      height: "100%",
                      background: color,
                      borderRadius: 999,
                    }}
                    title={`${it.mem}: ${formatInt(it.qty)}`}
                  />
                </div>

                <div style={{ textAlign: "right", fontWeight: 900 }}>{formatInt(it.qty)}</div>
              </div>
            );
          })}
        </div>

        <div style={{ opacity: 0.7, marginTop: ".75rem", fontSize: ".9rem" }}>
          Sheet: {sheet || "—"} · Detectado: hotel={keysDetected.kHotel || "—"} · membership={keysDetected.kMem || "—"} ·
          qty={keysDetected.kQty || "—"} · fecha={keysDetected.kFecha || "—"}
          {allowedHotels?.length ? ` · allowedHotels=${allowedHotels.join(", ")}` : ""}
          {hotelFilter ? ` · filtroHotel=${hotelFilter}` : ""}
        </div>

        <div style={{ opacity: 0.65, marginTop: ".35rem", fontSize: ".85rem" }}>
          (Base {baseYear} listo para comparativa futura, sin tocar esta base estable.)
        </div>
      </div>
    </section>
  );
}
