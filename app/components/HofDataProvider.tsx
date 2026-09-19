"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { readCsvFromPublic } from "./useCsvClient";
import { GlobalHotel, HofFilter, HofRow, toHofRow } from "./hofModel";

type Ctx = {
  loading: boolean;
  error: string;

  // filtros compartidos (por grupo)
  year: number;
  setYear: (y: number) => void;

  baseYear: number;
  setBaseYear: (y: number) => void;

  hof: HofFilter;
  setHof: (h: HofFilter) => void;

  // JCR
  jcrHotel: GlobalHotel; // MARRIOTT / SHERATON BCR / SHERATON MDQ
  setJcrHotel: (h: GlobalHotel) => void;

  // Maitei on/off (por si en algún momento lo querés ocultar)
  maiteiOn: boolean;
  setMaiteiOn: (v: boolean) => void;

  // datos normalizados
  allRows: HofRow[];
  jcrRows: HofRow[];    // ya filtradas por hotel y HoF (pero incluyen year/baseYear)
  maiteiRows: HofRow[]; // ya filtradas por HoF (incluyen year/baseYear)
};

const HofContext = createContext<Ctx | null>(null);

export function useHofData() {
  const c = useContext(HofContext);
  if (!c) throw new Error("useHofData debe usarse dentro de HofDataProvider");
  return c;
}

function applyHofFilter(rows: HofRow[], hof: HofFilter) {
  if (hof === "All") return rows;
  return rows.filter((r) => r.hof === hof);
}

export function HofDataProvider({
  filePath,
  defaultYear = 2025,
  defaultBaseYear = 2024,
  children,
}: {
  filePath: string;
  defaultYear?: number;
  defaultBaseYear?: number;
  children: React.ReactNode;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [year, setYear] = useState<number>(defaultYear);
  const [baseYear, setBaseYear] = useState<number>(defaultBaseYear);
  const [hof, setHof] = useState<HofFilter>("All");

  const [jcrHotel, setJcrHotel] = useState<GlobalHotel>("MARRIOTT");
  const [maiteiOn, setMaiteiOn] = useState<boolean>(true);

  const [allRows, setAllRows] = useState<HofRow[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");

    (async () => {
      try {
        const r: any = await readCsvFromPublic(filePath);

        // Compatibilidad: a veces devuelve array directamente, a veces {rows}
        const rawRows: Record<string, any>[] = Array.isArray(r) ? r : (r?.rows ?? []);

        const normalized: HofRow[] = [];
        for (const rr of rawRows) {
          const hr = toHofRow(rr);
          if (hr) normalized.push(hr);
        }

        if (!alive) return;
        setAllRows(normalized);
        setLoading(false);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ? `No se pudo leer CSV: ${e.message}` : "No se pudo leer CSV");
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [filePath]);

  const jcrRows = useMemo(() => {
    // JCR = 3 hoteles
    const isJcr =
      jcrHotel === "MARRIOTT" || jcrHotel === "SHERATON BCR" || jcrHotel === "SHERATON MDQ";

    if (!isJcr) return [];

    const filtered = allRows.filter((r) => r.empresaNorm === jcrHotel);
    return applyHofFilter(filtered, hof);
  }, [allRows, jcrHotel, hof]);

  const maiteiRows = useMemo(() => {
    if (!maiteiOn) return [];
    const filtered = allRows.filter((r) => r.empresaNorm === "MAITEI");
    return applyHofFilter(filtered, hof);
  }, [allRows, hof, maiteiOn]);

  const value: Ctx = {
    loading,
    error,
    year,
    setYear,
    baseYear,
    setBaseYear,
    hof,
    setHof,
    jcrHotel,
    setJcrHotel,
    maiteiOn,
    setMaiteiOn,
    allRows,
    jcrRows,
    maiteiRows,
  };

  return <HofContext.Provider value={value}>{children}</HofContext.Provider>;
}
