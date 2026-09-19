"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Tone = "red" | "blue" | "neutral";

export type KpiCarouselItem = {
  label: string;
  value: string;
  sub?: string;

  /** texto ya formateado tipo "Δ +4,2%" */
  deltaText?: string;

  /** número para colorear (positivo/negativo) */
  deltaValue?: number;
};

type Props = {
  tone: Tone;
  items: KpiCarouselItem[];

  /** default 4500 (4.5s) */
  intervalMs?: number;

  /** default true */
  showDots?: boolean;

  /** default true */
  pauseOnHover?: boolean;
};

function gradForTone(tone: Tone) {
  if (tone === "red") return "linear-gradient(135deg, rgba(220,38,38,.95), rgba(168,85,247,.70))"; // rojo->violeta
  if (tone === "blue") return "linear-gradient(135deg, rgba(56,189,248,.95), rgba(37,99,235,.70))"; // celeste->azul
  return "linear-gradient(135deg, rgba(255,255,255,.18), rgba(255,255,255,.06))";
}

function borderForTone(tone: Tone) {
  if (tone === "red") return "rgba(244,63,94,.35)";
  if (tone === "blue") return "rgba(56,189,248,.35)";
  return "rgba(255,255,255,.18)";
}

function dotForTone(tone: Tone) {
  if (tone === "red") return "rgba(244,63,94,.95)";
  if (tone === "blue") return "rgba(56,189,248,.95)";
  return "rgba(255,255,255,.75)";
}

function deltaColor(v?: number) {
  if (v === undefined || v === null) return "rgba(255,255,255,.88)";
  if (v > 0) return "#22c55e"; // verde fuerte
  if (v < 0) return "#ef4444"; // rojo fuerte
  return "rgba(255,255,255,.88)";
}

export default function KpiCarousel({
  tone,
  items,
  intervalMs = 4500,
  showDots = true,
  pauseOnHover = true,
}: Props) {
  const safeItems = items ?? [];
  const [idx, setIdx] = useState(0);
  const [hover, setHover] = useState(false);
  const timerRef = useRef<number | null>(null);

  const count = safeItems.length;

  // clamp idx if items change
  useEffect(() => {
    if (idx >= count) setIdx(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const canRun = useMemo(() => {
    if (count <= 1) return false;
    if (!pauseOnHover) return true;
    return !hover;
  }, [count, pauseOnHover, hover]);

  useEffect(() => {
    if (!canRun) return;

    timerRef.current = window.setInterval(() => {
      setIdx((cur) => (cur + 1) % count);
    }, intervalMs);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [canRun, intervalMs, count]);

  if (!count) return null;

  const it = safeItems[idx];

  return (
    <section
      className="section"
      style={{ display: "grid", gap: ".6rem" }}
      onMouseEnter={() => pauseOnHover && setHover(true)}
      onMouseLeave={() => pauseOnHover && setHover(false)}
    >
      {/* CARD ÚNICA GRANDE */}
      <div
        className="card"
        style={{
          borderRadius: 22,
          padding: "1.25rem 1.25rem",
          border: `1px solid ${borderForTone(tone)}`,
          background: "rgba(255,255,255,.05)",
          position: "relative",
          overflow: "hidden",
          minHeight: 140,
          boxShadow: "0 18px 40px rgba(0,0,0,.22)",
        }}
      >
        {/* fondo degradé */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: gradForTone(tone),
            opacity: 0.18,
          }}
        />

        {/* brillo suave */}
        <div
          style={{
            position: "absolute",
            width: 260,
            height: 260,
            borderRadius: 999,
            right: -90,
            top: -90,
            background: "rgba(255,255,255,.22)",
            filter: "blur(18px)",
            opacity: 0.25,
          }}
        />

        <div style={{ position: "relative", display: "grid", gap: ".35rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: ".75rem", alignItems: "baseline" }}>
            <div style={{ fontSize: "1.02rem", fontWeight: 900, opacity: 0.9 }}>{it.label}</div>

            {it.deltaText ? (
              <div
                style={{
                  fontWeight: 950,
                  color: deltaColor(it.deltaValue),
                  background: "rgba(0,0,0,.42)",
                  border: "1px solid rgba(255,255,255,.18)",
                  padding: ".22rem .6rem",
                  borderRadius: 999,
                  fontSize: ".95rem",
                  whiteSpace: "nowrap",
                  textShadow: "0 1px 6px rgba(0,0,0,.65)",   // CLAVE para que el verde se lea
                  boxShadow: "0 10px 22px rgba(0,0,0,.22)", // ayuda al contraste
                }}
                title="Variación vs base"
              >
                <b style={{ fontWeight: 950 }}>{it.deltaText}</b>
              </div>
            ) : null}
          </div>

          <div style={{ fontSize: "2.15rem", fontWeight: 950, letterSpacing: -0.3, lineHeight: 1.05 }}>
            {it.value}
          </div>

          {it.sub ? (
            <div style={{ opacity: 0.85, fontWeight: 750, marginTop: ".1rem" }}>{it.sub}</div>
          ) : (
            <div style={{ opacity: 0.75, fontWeight: 700, marginTop: ".1rem" }}>
              {/* espacio para que la card no “salte” */}
            </div>
          )}

          {/* barra de progreso visual del slide */}
          {count > 1 ? (
            <div
              style={{
                marginTop: ".45rem",
                height: 6,
                borderRadius: 999,
                background: "rgba(255,255,255,.10)",
                overflow: "hidden",
              }}
            >
              <div
                key={`${idx}-${canRun ? "run" : "stop"}`}
                style={{
                  height: "100%",
                  width: canRun ? "100%" : "40%",
                  background: "rgba(255,255,255,.45)",
                  borderRadius: 999,
                  transformOrigin: "left",
                  animation: canRun ? `kpiProgress ${intervalMs}ms linear forwards` : "none",
                }}
              />
            </div>
          ) : null}
        </div>
      </div>

      {/* dots + click */}
      {showDots && count > 1 ? (
        <div style={{ display: "flex", justifyContent: "center", gap: ".45rem", marginTop: ".1rem" }}>
          {safeItems.map((_, i) => {
            const active = i === idx;
            return (
              <button
                key={i}
                onClick={() => setIdx(i)}
                aria-label={`KPI ${i + 1}`}
                style={{
                  width: active ? 22 : 10,
                  height: 10,
                  borderRadius: 999,
                  border: "1px solid rgba(255,255,255,.18)",
                  background: active ? dotForTone(tone) : "rgba(255,255,255,.18)",
                  cursor: "pointer",
                  transition: "all 180ms ease",
                }}
              />
            );
          })}
        </div>
      ) : null}

      {/* keyframes inline (para no tocar css global) */}
      <style jsx>{`
        @keyframes kpiProgress {
          from {
            transform: scaleX(0);
          }
          to {
            transform: scaleX(1);
          }
        }
      `}</style>
    </section>
  );
}
