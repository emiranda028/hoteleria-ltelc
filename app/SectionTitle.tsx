"use client";

import React from "react";

export default function SectionTitle({
  title,
  desc,
  right,
  id,
}: {
  title: string;
  desc?: string;
  right?: React.ReactNode;
  id?: string;
}) {
  return (
    <div id={id} style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "1rem" }}>
      <div>
        <div style={{ fontSize: "1.35rem", fontWeight: 950, letterSpacing: ".2px" }}>{title}</div>
        {desc ? <div style={{ marginTop: ".25rem", opacity: 0.8 }}>{desc}</div> : null}
      </div>
      {right ? <div>{right}</div> : null}
    </div>
  );
}
