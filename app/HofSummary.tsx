"use client";

import React, { useEffect, useMemo, useState } from "react";
import { readXlsxFromPublic, XlsxRow } from "./xlsxClient";

type Theme = "jcr" | "gotel";

function pickTheme(theme: Theme) {
  if (theme === "gotel") {
    return {
      border: "rgba(0,160,255,.35)",
      chip: "rgba(0,160,255,.16)",
    };
  }
  return {
    border: "rgba(210,0,35,.35)",
    chip: "rgba(210,0,35,.14)",
  };
}

function norm(s: any) {
  return String(s ?? "")
    .trim()
    .toUpperCase();
}

function fmtInt(n: number) {
  return Math.round(n).toLocaleString("es-AR");
}

function pickKey(keys: string[], candidates: string[]) {
  const upper = new Map(keys.map((k) => [k.toUpperCase(), k]));
  for (const c of candidates) {
    const k = upper.get(c.toUpperCase());
    if (k) return k;
  }
  return "";
}

export default function MembershipSummary({
  filePath,
  hotelFilter, // "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI" | "ALL"
  title = "Membership",
  theme = "jcr",
}: {
  filePath: string;
  hotelFilter: string;
  title?: string;
  theme?: Theme;
}) {
  const t = pickTheme(theme);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState<XlsxRow[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");

    (async () => {
      try {
        const r: any = await readXlsxFromPublic(filePath);
        const rr: XlsxRow[] = r?.rows ?? [];
        if (!alive) return;
        setRows(rr);
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

  const view = useMemo(() => {
    if (!rows || rows.length === 0) return { items: [] as any[], total: 0 };

    const keys = Object.keys(rows[0] ?? {});
    const kHotel = pickKey(keys, ["Empresa", "Hotel"]);
    const kMem = pickKey(keys, ["Membership", "Membresia", "Membresía", "Bonvoy", "Bonboy"]);
    const kVal = pickKey(keys, ["Total", "Cantidad", "Count", "N"]);

    const filtered =
      hotelFilter && hotelFilter !== "ALL" && kHotel
        ? rows.filter((r) => norm(r[kHotel]) === norm(hotelFilter))
        : rows.slice();

    const map = new Map<string, number>();
    let total = 0;

    for (const r of filtered) {
      const mem = kMem ? String(r[kMem] ?? "").trim() : "";
      const valRaw = kVal ? Number(String(r[kVal] ?? "0").replace(/\./g, "").replace(",", ".")) : 0;
      const val = Number.isFinite(valRaw) ? valRaw : 0;
      if (!mem) continue;
      map.set(mem, (map.get(mem) ?? 0) + val);
      total += val;
    }

    const items = Array.from(map.entries())
      .map(([k, v]) => ({ membership: k, value: v, pct: total > 0 ? v / total : 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);

    return { items, total };
  }, [rows, hotelFilter]);

  return (
    <section className="section">
      <div className="sectionTitle" style={{ fontSize: "1.15rem", fontWeight: 950 }}>
        {title}
      </div>

      <div style={{ marginTop: ".85rem" }}>
        {loading ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Cargando membership…</div>
        ) : err ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Error: {err}</div>
        ) : view.items.length === 0 ? (
          <div className="card" style={{ padding: "1rem", borderRadius: 18 }}>Sin datos de membership para el filtro.</div>
        ) : (
          <div className="card" style={{ padding: "1rem", borderRadius: 18, border: `1px solid ${t.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
              <div style={{ opacity: 0.85 }}>Top memberships</div>
              <div
                style={{
                  padding: ".25rem .6rem",
                  borderRadius: 999,
                  border: `1px solid ${t.border}`,
                  background: t.chip,
                  fontWeight: 800,
                }}
              >
                Total: {fmtInt(view.total)}
              </div>
            </div>

            <div style={{ marginTop: ".85rem", display: "grid", gap: ".45rem" }}>
              {view.items.map((it) => (
                <div
                  key={it.membership}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 140px",
                    gap: ".75rem",
                    alignItems: "center",
                    borderTop: "1px solid rgba(255,255,255,.08)",
                    paddingTop: ".45rem",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>{it.membership}</div>
                    <div style={{ fontSize: ".85rem", opacity: 0.75 }}>{(it.pct * 100).toFixed(1)}%</div>
                  </div>
                  <div style={{ textAlign: "right", fontWeight: 900 }}>{fmtInt(it.value)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
