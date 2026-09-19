"use client";

import { useMemo } from "react";

type Item = { membership: string; cur: number; base: number; hasBase: boolean; deltaPct: number };

function normalizeMembershipKey(raw: string) {
  const s = (raw ?? "").toString().toUpperCase();
  if (s.includes("(AMB)") || s.includes("AMBASSADOR")) return "AMB";
  if (s.includes("(TTM)") || s.includes("TITANIUM")) return "TTM";
  if (s.includes("(PLT)") || s.includes("PLATINUM")) return "PLT";
  if (s.includes("(GLD)") || s.includes("GOLD")) return "GLD";
  if (s.includes("(SLR)") || s.includes("SILVER")) return "SLR";
  if (s.includes("(MRD)") || s.includes("MEMBER")) return "MRD";
  return "OTH";
}

const isElite = (k: string) => ["AMB", "TTM", "PLT", "GLD"].includes(k);

export default function EliteMix({
  items,
  year,
  baseYear,
}: {
  items: Item[];
  year: number;
  baseYear: number;
}) {
  const summary = useMemo(() => {
    const curElite = items.filter((x) => isElite(normalizeMembershipKey(x.membership))).reduce((s, x) => s + x.cur, 0);
    const curNon = items.reduce((s, x) => s + x.cur, 0) - curElite;

    const baseElite = items.filter((x) => isElite(normalizeMembershipKey(x.membership))).reduce((s, x) => s + x.base, 0);
    const baseNon = items.reduce((s, x) => s + x.base, 0) - baseElite;

    const curTotal = curElite + curNon;
    const baseTotal = baseElite + baseNon;

    const curElitePct = curTotal > 0 ? (curElite / curTotal) * 100 : 0;
    const baseElitePct = baseTotal > 0 ? (baseElite / baseTotal) * 100 : NaN;

    const pp = Number.isFinite(baseElitePct) ? curElitePct - baseElitePct : NaN;

    return { curElite, curNon, curTotal, curElitePct, baseElitePct, pp };
  }, [items]);

  const bar = (pct: number) => (
    <div className="rankBarWrap" style={{ width: 260 }}>
      <div className="rankBar" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );

  return (
    <div className="card" style={{ gridColumn: "1 / -1" }}>
      <div className="cardTop">
        <div>
          <div className="cardTitle">Mix de Membership – Elite vs No-Elite (JCR)</div>
          <div className="cardNote">Elite = Ambassador + Titanium + Platinum + Gold</div>
        </div>
      </div>

      <div className="cardRow" style={{ marginTop: ".8rem", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        <div className="card">
          <div className="cardTitle">Elite share ({year})</div>
          <div className="cardValue">{summary.curElitePct.toFixed(1).replace(".", ",")}%</div>
          {bar(summary.curElitePct)}
          <div className="cardNote" style={{ marginTop: ".45rem" }}>
            Elite: <strong>{summary.curElite.toLocaleString("es-AR")}</strong> · Total:{" "}
            <strong>{summary.curTotal.toLocaleString("es-AR")}</strong>
          </div>
        </div>

        <div className="card">
          <div className="cardTitle">Variación vs {baseYear}</div>
          <div className="cardValue">
            {Number.isFinite(summary.pp) ? `${summary.pp >= 0 ? "+" : ""}${summary.pp.toFixed(1).replace(".", ",")} p.p.` : "—"}
          </div>
          <div className="cardNote">
            {Number.isFinite(summary.baseElitePct)
              ? `Base ${baseYear}: ${summary.baseElitePct.toFixed(1).replace(".", ",")}%`
              : "Base sin datos comparables"}
          </div>
        </div>
      </div>
    </div>
  );
}
