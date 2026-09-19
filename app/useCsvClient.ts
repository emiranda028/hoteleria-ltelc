"use client";

import { useEffect, useState } from "react";

/* =========================
   Tipos
========================= */

export type CsvRow = Record<string, any>;

export type CsvReadResult = {
  rows: CsvRow[];
  rawText?: string;
  delimiter?: string;
};

export type UseCsvResult = {
  rows: CsvRow[];
  loading: boolean;
  error: string;
};

/* =========================
   CSV parser robusto (sin libs)
   - respeta comillas
   - soporta comas/puntoycoma/tab dentro de comillas
   - soporta saltos de línea dentro de comillas
   - AUTO-DETECTA delimitador: , ; \t
========================= */

function detectDelimiter(sampleLine: string): string {
  // contamos separadores fuera de comillas
  const count = (delim: string) => {
    let inQuotes = false;
    let c = 0;
    for (let i = 0; i < sampleLine.length; i++) {
      const ch = sampleLine[i];
      if (ch === '"') {
        const next = sampleLine[i + 1];
        if (inQuotes && next === '"') {
          i++;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (!inQuotes && ch === delim) c++;
    }
    return c;
  };

  const cComma = count(",");
  const cSemi = count(";");
  const cTab = count("\t");

  // elegimos el que más “cortes” tenga
  if (cSemi >= cComma && cSemi >= cTab && cSemi > 0) return ";";
  if (cTab >= cComma && cTab >= cSemi && cTab > 0) return "\t";
  return ","; // default
}

function parseCSV(text: string): { rows: CsvRow[]; delimiter: string } {
  if (!text) return { rows: [], delimiter: "," };

  // normalizo fin de línea
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // buscamos una primera línea “no vacía” para detectar delimitador
  const firstNonEmptyLine =
    s.split("\n").find((l) => l.trim().length > 0) ?? "";

  const delimiter = detectDelimiter(firstNonEmptyLine);

  const rowsMatrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    const allEmpty = row.every((x) => (x ?? "").trim() === "");
    if (!allEmpty) rowsMatrix.push(row);
    row = [];
  };

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (ch === '"') {
      const next = s[i + 1];
      if (inQuotes && next === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    // separador (según delimiter detectado)
    if (!inQuotes && ch === delimiter) {
      pushField();
      continue;
    }

    // fin de línea (solo si NO estamos dentro de comillas)
    if (!inQuotes && ch === "\n") {
      pushField();
      pushRow();
      continue;
    }

    field += ch;
  }

  // flush final
  pushField();
  pushRow();

  if (!rowsMatrix.length) return { rows: [], delimiter };

  // headers
  const headersRaw = rowsMatrix[0] ?? [];
  const headers = headersRaw.map((h, idx) => {
    const clean = String(h ?? "")
      .replace(/^"|"$/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return clean || `col_${idx + 1}`;
  });

  // data
  const out: CsvRow[] = [];
  for (let r = 1; r < rowsMatrix.length; r++) {
    const values = rowsMatrix[r] ?? [];
    const obj: CsvRow = {};

    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      const v = values[c] ?? "";
      obj[key] = String(v).replace(/^"|"$/g, "").trim();
    }

    out.push(obj);
  }

  return { rows: out, delimiter };
}

/* =========================
   API COMPAT
========================= */

export async function readCsvFromPublic(path: string): Promise<CsvReadResult> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`No se pudo leer CSV: ${path} (${res.status})`);
  }
  const text = await res.text();
  const parsed = parseCSV(text);
  return { rows: parsed.rows, rawText: text, delimiter: parsed.delimiter };
}

/* =========================
   Hook
========================= */

export function useCsvClient(filePath: string): UseCsvResult {
  const [rows, setRows] = useState<CsvRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    setLoading(true);
    setError("");

    readCsvFromPublic(filePath)
      .then(({ rows }) => {
        if (!alive) return;
        setRows(rows);
        setLoading(false);
      })
      .catch((err) => {
        if (!alive) return;
        setError(err?.message ?? "Error leyendo CSV");
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [filePath]);

  return { rows, loading, error };
}

/* =========================
   Helpers numéricos + compat
========================= */

export function num(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;

  const s = String(v).trim();
  if (!s) return 0;

  // 22.441,71  -> 22441.71
  // 59,40%     -> 59.40
  const cleaned = s
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace("%", "");

  const n = Number(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

/** Convierte a proporción 0..1 si viene en % */
export function pct01(v: any): number {
  const n = typeof v === "number" ? v : num(v);
  return n > 1 ? n / 100 : n;
}

// compat vieja
export function safeDiv(a: number, b: number): number {
  return b === 0 ? 0 : a / b;
}
export function toNumberSmart(v: any): number {
  return num(v);
}
export function toPercent01(v: any): number {
  return pct01(v);
}
export function formatPct01(v: any): string {
  return (pct01(v) * 100).toFixed(1) + "%";
}
export function formatPct(v: any): string {
  return formatPct01(v);
}
export function formatMoney(n: number): string {
  return n.toLocaleString("es-AR", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
