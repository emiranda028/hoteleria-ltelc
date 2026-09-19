"use client";

import { useMemo, useState } from "react";
import YearComparator from "./components/YearComparator";
import MembershipSummary from "./components/MembershipSummary";
import CountryRanking from "./components/CountryRanking";
import { JcrStickyFilters, MaiteiStickyFilters } from "./components/StickyFilterBars";
import HFPowerBiPanel from "./components/HFPowerBiPanel";
import ResumenComparadoPanel from "./components/ResumenComparadoPanel";

const HF_PATH = "/api/daily-metrics.csv";
const MEMBERSHIP_PATH = "/data/jcr_membership.xlsx";
const NACIONALIDADES_PATH = "/data/jcr_nacionalidades.xlsx";

const JCR_HOTELS = [
  { value: "ALL", label: "Todos" },
  { value: "MARRIOTT", label: "Marriott" },
  { value: "SHERATON BCR", label: "Sheraton BCR" },
  { value: "SHERATON MDQ", label: "Sheraton MDQ" },
];

function BlockHeader({
  tone,
  title,
  subtitle,
}: {
  tone: "red" | "blue";
  title: string;
  subtitle: string;
}) {
  const grad =
    tone === "red"
      ? "linear-gradient(135deg, rgba(220,38,38,.95), rgba(251,113,133,.75))"
      : "linear-gradient(135deg, rgba(59,130,246,.95), rgba(14,165,233,.70))";

  return (
    <div
      className="card"
      style={{
        padding: "1.1rem",
        borderRadius: 22,
        border: "1px solid rgba(255,255,255,.12)",
        background: "rgba(255,255,255,.05)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: grad,
          opacity: 0.12,
        }}
      />
      <div style={{ position: "relative", display: "grid", gap: ".5rem" }}>
        <div style={{ fontSize: "1.35rem", fontWeight: 950, letterSpacing: -0.2 }}>
          {title}
        </div>
        <div style={{ opacity: 0.85, fontWeight: 650 }}>{subtitle}</div>

        <div
          className="card"
          style={{
            marginTop: ".65rem",
            padding: ".85rem",
            borderRadius: 18,
            border: "1px solid rgba(255,255,255,.12)",
            background: "rgba(0,0,0,.10)",
            display: "grid",
            gap: ".25rem",
          }}
        >
          <div style={{ fontWeight: 900 }}>LTELC Consultora</div>
          <div style={{ opacity: 0.85 }}>Correo: agencialtelc@gmail.com</div>
          <div style={{ opacity: 0.85 }}>Web: www.lotengoenlacabeza.com.ar</div>
        </div>
      </div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div style={{ margin: "1.25rem 0 .25rem" }}>
      <div
        style={{
          height: 1,
          background: "linear-gradient(90deg, rgba(255,255,255,.12), rgba(255,255,255,.04))",
        }}
      />
      <div style={{ marginTop: ".65rem", fontWeight: 900, opacity: 0.85 }}>{label}</div>
    </div>
  );
}

export default function Page() {
  // ===== JCR filtros =====
  const [jcrYear, setJcrYear] = useState<number>(2025);
  const [jcrBaseYear, setJcrBaseYear] = useState<number>(2024);
  const [jcrHotel, setJcrHotel] = useState<string>("ALL");
  const [jcrQuarter, setJcrQuarter] = useState<number>(1);
  const [jcrMonth, setJcrMonth] = useState<number>(new Date().getMonth() + 1);

  // ===== Maitei filtros =====
  const [maiYear, setMaiYear] = useState<number>(2025);
  const [maiBaseYear, setMaiBaseYear] = useState<number>(2024);
  const [maiQuarter, setMaiQuarter] = useState<number>(1);
  const [maiMonth, setMaiMonth] = useState<number>(new Date().getMonth() + 1);

  // Años (si vos ya los calculás dinámico, lo reemplazás)
  const years = useMemo(() => [2026, 2025, 2024, 2023, 2022, 2021, 2020], []);

  const jcrHotelFilter = jcrHotel === "ALL" ? "" : jcrHotel;

  return (
    <main style={{ padding: "1.25rem", display: "grid", gap: "1.25rem" }}>
      {/* =========================
          BLOQUE JCR
      ========================== */}
      <section
        style={{
          display: "grid",
          gap: "1rem",
          paddingBottom: "1.25rem",
        }}
      >
        <BlockHeader
          tone="red"
          title="Informe de Gestión — Grupo JCR"
          subtitle="Presentación informe de gestión de LTELC sobre gestión hotelera (Marriott · Sheraton BCR · Sheraton MDQ)."
        />

        {/* Sticky SOLO de JCR */}
        <div style={{ position: "sticky", top: 12, zIndex: 50 }}>
          <JcrStickyFilters
            year={jcrYear}
            baseYear={jcrBaseYear}
            onYear={setJcrYear}
            onBaseYear={setJcrBaseYear}
            hotel={jcrHotel}
            onHotel={setJcrHotel}
            years={years}
            hotels={JCR_HOTELS}
            quarter={jcrQuarter}
            onQuarter={setJcrQuarter}
            month={jcrMonth}
            onMonth={setJcrMonth}
          />
        </div>

        {/* Resumen Ejecutivo Comparado: los 3 hoteles de Panatel lado a lado */}
        <ResumenComparadoPanel hotelFilter={jcrHotel} />

        {/* Panel estilo Power BI real (gauges + combo chart), datos en vivo */}
        <HFPowerBiPanel hotelFilter={jcrHotel} />

        {/* H&F + rankings dentro del YearComparator */}
        <YearComparator
          filePath={HF_PATH}
          year={jcrYear}
          baseYear={jcrBaseYear}
          hotelFilter={jcrHotelFilter} // "" => todos JCR
        />

        <MembershipSummary
          year={jcrYear}
          baseYear={jcrBaseYear}
          filePath={MEMBERSHIP_PATH}
          hotelFilter={jcrHotelFilter}
          allowedHotels={["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"]}
          compactCharts={false}
        />

        <div style={{ marginTop: ".25rem" }}>
          <div className="sectionTitle" style={{ fontSize: "1.2rem", fontWeight: 950 }}>
            Nacionalidades
          </div>
          <div className="sectionDesc" style={{ marginTop: ".35rem", opacity: 0.85 }}>
            Ranking por país + distribución por continente. (Archivo Marriott). Usa filtro global de año del bloque JCR.
          </div>
          <div style={{ marginTop: ".85rem" }}>
            <CountryRanking year={jcrYear} filePath={NACIONALIDADES_PATH} />
          </div>
        </div>
      </section>

      <Divider label="▼ Fin Bloque JCR · Inicio Bloque Gotel (Maitei)" />

      {/* =========================
          BLOQUE GOTEL / MAITEI
      ========================== */}
      <section style={{ display: "grid", gap: "1rem", paddingBottom: "1.25rem" }}>
        <BlockHeader
          tone="blue"
          title="Informe de Gestión — Grupo Gotel"
          subtitle="Bloque independiente con filtros propios para Maitei (Management Gotel)."
        />

        {/* Sticky SOLO de Maitei */}
        <div style={{ position: "sticky", top: 12, zIndex: 50 }}>
          <MaiteiStickyFilters
            year={maiYear}
            baseYear={maiBaseYear}
            onYear={setMaiYear}
            onBaseYear={setMaiBaseYear}
            years={years}
            quarter={maiQuarter}
            onQuarter={setMaiQuarter}
            month={maiMonth}
            onMonth={setMaiMonth}
          />
        </div>

        <ResumenComparadoPanel hotelFilter={"MAITEI"} />

        <HFPowerBiPanel hotelFilter={"MAITEI"} />

        <YearComparator
          filePath={HF_PATH}
          year={maiYear}
          baseYear={maiBaseYear}
          hotelFilter={"MAITEI"} // fijo
        />
      </section>
    </main>
  );
}
