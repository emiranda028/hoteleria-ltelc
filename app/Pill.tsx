"use client";

import React from "react";

type Props = React.PropsWithChildren<{
  active?: boolean;
  tone?: "red" | "blue" | "neutral";
  onClick?: () => void;
  title?: string;
  style?: React.CSSProperties;
}>;

export default function Pill({
  children,
  active = false,
  tone = "neutral",
  onClick,
  title,
  style,
}: Props) {
  const palette =
    tone === "red"
      ? {
          bg: active ? "rgba(220,38,38,.92)" : "rgba(220,38,38,.18)",
          bd: active ? "rgba(220,38,38,.75)" : "rgba(220,38,38,.35)",
          tx: active ? "white" : "rgba(255,255,255,.92)",
        }
      : tone === "blue"
      ? {
          bg: active ? "rgba(59,130,246,.92)" : "rgba(59,130,246,.18)",
          bd: active ? "rgba(59,130,246,.75)" : "rgba(59,130,246,.35)",
          tx: active ? "white" : "rgba(255,255,255,.92)",
        }
      : {
          bg: active ? "rgba(255,255,255,.14)" : "rgba(255,255,255,.08)",
          bd: active ? "rgba(255,255,255,.30)" : "rgba(255,255,255,.18)",
          tx: "rgba(255,255,255,.92)",
        };

  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={{
        cursor: onClick ? "pointer" : "default",
        border: `1px solid ${palette.bd}`,
        background: palette.bg,
        color: palette.tx,
        padding: ".45rem .7rem",
        borderRadius: 999,
        fontWeight: 800,
        fontSize: ".92rem",
        letterSpacing: ".2px",
        transition: "all .15s ease",
        boxShadow: active ? "0 10px 22px rgba(0,0,0,.22)" : "none",
        ...style,
      }}
    >
      {children}
    </button>
  );
}
