"use client";

/**
 * Panel "estilo Power BI real" — reconstruye el look que ya usan los
 * tableros de Panatel/Numah (gauges semicirculares, paleta rojo/crimson,
 * combo chart de revenue + habitaciones ocupadas), pero alimentado con los
 * datos reales de Supabase (via /api/hotels, /api/kpis y /api/daily-metrics)
 * en vez del Excel.
 *
 * Nota de alcance: el Power BI real también muestra "Deduct Group" y
 * "Deduct Indiv." (desglose por canal de reserva) en las cajitas chicas del
 * día — esas dos columnas no existen todavía en daily_metrics (no las trae
 * el parser de R106), así que por ahora se muestran Comp. Rooms y House Use
 * en su lugar, que sí están cargadas. Se puede sumar cuando haga falta.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Chart as ChartJS,
  BarElement,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Tooltip,
  Legend,
} from "chart.js";
import { Chart } from "react-chartjs-2";

ChartJS.register(BarElement, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Legend);

type Hotel = { id: string; code: string; name: string };

type KpiRow = {
  hotel_id: string;
  mes: string;
  hof: "history" | "forecast";
  occ_pct: number | null;
  adr: number | null;
  revpar: number | null;
  room_revenue: number | null;
  occupied_rooms: number | null;
  rooms_avail_est: number | null;
  dias: number;
};

type DailyRow = {
  hotel_id: string;
  fecha: string;
  hof: "history" | "forecast";
  total_occ_rooms: number | null;
  comp_rooms: number | null;
  house_use_rooms: number | null;
  dep_rooms: number | null;
  day_use_rooms: number | null;
  no_show_rooms: number | null;
  ooo_rooms: number | null;
  adl_chl: number | null;
  room_revenue: number | null;
  average_rate_reported: number | null;
  occ_pct_reported: number | null;
};

const RED = "#a61e3a";
const INK = "#1f1f1f";
const INK_SOFT = "#545454";
const LINE = "#d9d9d9";

function Gauge({ label, valuePct, color }: { label: string; valuePct: number; color: string }) {
  const total = 172.8;
  const filled = Math.max(0, Math.min(100, valuePct)) / 100 * total;
  return (
    <div
      style={{
        background: "white",
        border: `1px solid ${LINE}`,
        borderRadius: 4,
        padding: "10px 8px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <div style={{ fontSize: 12, color: INK, fontWeight: 500, marginBottom: 2, textAlign: "center" }}>{label}</div>
      <svg viewBox="0 0 140 80" style={{ width: 130, height: 74 }}>
        <path d="M 15 70 A 55 55 0 0 1 125 70" fill="none" stroke="#e8e8e8" strokeWidth="16" />
        <path
          d="M 15 70 A 55 55 0 0 1 125 70"
          fill="none"
          stroke={color}
          strokeWidth="16"
          strokeDasharray={`${filled} ${total}`}
        />
      </svg>
      <div style={{ fontSize: 20, fontWeight: 600, marginTop: -6, color: INK }}>
        {valuePct.toFixed(2).replace(".", ",")}%
      </div>
    </div>
  );
}

function MiniBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ background: "white", border: `1px solid ${LINE}`, padding: "6px 4px", textAlign: "center", borderRadius: 3 }}>
      <div style={{ fontSize: 10, color: INK_SOFT }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 500, marginTop: 2, color: INK }}>{value}</div>
    </div>
  );
}

function combine(hist: KpiRow | undefined, fcst: KpiRow | undefined) {
  const occRooms = (hist?.occupied_rooms ?? 0) + (fcst?.occupied_rooms ?? 0);
  const avail = (hist?.rooms_avail_est ?? 0) + (fcst?.rooms_avail_est ?? 0);
  const revenue = (hist?.room_revenue ?? 0) + (fcst?.room_revenue ?? 0);
  return {
    occ_pct: avail > 0 ? (occRooms / avail) * 100 : 0,
    adr: occRooms > 0 ? revenue / occRooms : 0,
    occupied_rooms: occRooms,
    room_revenue: revenue,
  };
}

export default function HFPowerBiPanel({ hotelFilter }: { hotelFilter: string }) {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      fetch("/api/hotels", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/kpis", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/daily-metrics", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([h, k, d]) => {
        if (!alive) return;
        if (h.error || k.error || d.error) {
          setError(h.error || k.error || d.error);
        } else {
          setHotels(h.data ?? []);
          setKpis(k.data ?? []);
          setDaily(d.data ?? []);
        }
        setLoading(false);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message ?? "Error cargando datos");
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const hotelIds = useMemo(() => {
    if (hotelFilter === "ALL" || !hotelFilter) return hotels.map((h) => h.id);
    const norm = hotelFilter.replace(/\s+/g, "_");
    return hotels.filter((h) => h.code === norm || h.code === hotelFilter).map((h) => h.id);
  }, [hotels, hotelFilter]);

  const mesActual = useMemo(() => {
    const meses = Array.from(new Set(kpis.map((k) => k.mes))).sort();
    // preferimos el mes con datos "history" más reciente; si no hay, el primero
    const conHistory = kpis.filter((k) => k.hof === "history").map((k) => k.mes);
    return conHistory.length ? conHistory.sort().slice(-1)[0] : meses[0];
  }, [kpis]);

  const kpisDelMes = useMemo(
    () => kpis.filter((k) => hotelIds.includes(k.hotel_id) && k.mes === mesActual),
    [kpis, hotelIds, mesActual]
  );

  const histAgg = useMemo(() => {
    const rows = kpisDelMes.filter((k) => k.hof === "history");
    const occ = rows.reduce((s, r) => s + (r.occupied_rooms ?? 0), 0);
    const avail = rows.reduce((s, r) => s + (r.rooms_avail_est ?? 0), 0);
    const rev = rows.reduce((s, r) => s + (r.room_revenue ?? 0), 0);
    return { occupied_rooms: occ, rooms_avail_est: avail, room_revenue: rev } as KpiRow as any;
  }, [kpisDelMes]);

  const fcstAgg = useMemo(() => {
    const rows = kpisDelMes.filter((k) => k.hof === "forecast");
    const occ = rows.reduce((s, r) => s + (r.occupied_rooms ?? 0), 0);
    const avail = rows.reduce((s, r) => s + (r.rooms_avail_est ?? 0), 0);
    const rev = rows.reduce((s, r) => s + (r.room_revenue ?? 0), 0);
    return { occupied_rooms: occ, rooms_avail_est: avail, room_revenue: rev } as KpiRow as any;
  }, [kpisDelMes]);

  const histC = combine(histAgg, undefined);
  const fcstC = combine(undefined, fcstAgg);
  const totalC = combine(histAgg, fcstAgg);

  const dailyDelMes = useMemo(() => {
    return daily
      .filter((d) => hotelIds.includes(d.hotel_id) && d.fecha.startsWith(mesActual))
      .sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [daily, hotelIds, mesActual]);

  // Min/Max real de ocupación diaria dentro del mes (no del agregado mensual):
  // agregamos las habitaciones ocupadas/disponibles por fecha (por si hay más
  // de un hotel seleccionado) y calculamos el % de ocupación día por día.
  const minMax = useMemo(() => {
    const pcts: number[] = [];
    for (const d of dailyDelMes) {
      if (d.occ_pct_reported && d.occ_pct_reported > 0) {
        pcts.push(d.occ_pct_reported);
      }
    }
    if (!pcts.length) return { min: 0, max: 0 };
    const max = Math.max(...pcts);
    const min = Math.min(...pcts);
    // occ_pct_reported puede venir como fracción (0.74) o como porcentaje (74.6)
    const scale = max <= 1 ? 100 : 1;
    return { min: min * scale, max: max * scale };
  }, [dailyDelMes]);

  const today = useMemo(() => {
    // el día más reciente con dato "history" (o el primero disponible)
    const hist = dailyDelMes.filter((d) => d.hof === "history");
    return hist.length ? hist[hist.length - 1] : dailyDelMes[0];
  }, [dailyDelMes]);

  const chartData = useMemo(() => {
    // agregamos por fecha si hay más de un hotel seleccionado
    const byFecha = new Map<string, { revenue: number; occ: number; hof: string }>();
    for (const d of dailyDelMes) {
      const cur = byFecha.get(d.fecha) ?? { revenue: 0, occ: 0, hof: d.hof };
      cur.revenue += d.room_revenue ?? 0;
      cur.occ += d.total_occ_rooms ?? 0;
      cur.hof = d.hof;
      byFecha.set(d.fecha, cur);
    }
    const fechas = Array.from(byFecha.keys()).sort();
    return {
      labels: fechas.map((f) => f.slice(8, 10)),
      revenue: fechas.map((f) => byFecha.get(f)!.revenue),
      occ: fechas.map((f) => byFecha.get(f)!.occ),
      hof: fechas.map((f) => byFecha.get(f)!.hof),
    };
  }, [dailyDelMes]);

  if (loading) {
    return <div style={{ padding: 24, color: INK_SOFT }}>Cargando panel…</div>;
  }
  if (error) {
    return <div style={{ padding: 24, color: RED }}>No se pudo cargar el panel: {error}</div>;
  }

  const barColors = chartData.hof.map((h) => (h === "forecast" ? "#9ebfe2" : "#cfcfcf"));

  return (
    <div style={{ background: "white", border: `1px solid ${LINE}`, borderRadius: 4, padding: "14px 16px", fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `2px solid ${RED}`,
          paddingBottom: 8,
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 700, color: RED, fontSize: 15, letterSpacing: "0.05em" }}>H&F</div>
        <div style={{ fontSize: 11, color: INK_SOFT }}>
          Mes: <b>{mesActual}</b> · datos en vivo desde Supabase
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <Gauge label="Av. Occ. Histórico" valuePct={histC.occ_pct} color="#a0a0a0" />
        <Gauge label="Av. Occ. Proyectado" valuePct={fcstC.occ_pct} color="#4a90e2" />
        <Gauge label="Av. Occ. Total" valuePct={totalC.occ_pct} color="#2fa84f" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
        <MiniBox label="Hab. Ocupadas Históricas" value={histC.occupied_rooms.toLocaleString("es-AR")} />
        <MiniBox label="Hab. Ocupadas Proyectadas" value={fcstC.occupied_rooms.toLocaleString("es-AR")} />
        <MiniBox label="Hab. Ocupadas Total" value={totalC.occupied_rooms.toLocaleString("es-AR")} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <MiniBox label="ADR History" value={"US$" + histC.adr.toFixed(0)} />
        <MiniBox label="ADR Forecast" value={"US$" + fcstC.adr.toFixed(0)} />
        <MiniBox label="ADR Mensual" value={"US$" + totalC.adr.toFixed(0)} />
      </div>

      {today && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8, marginBottom: 14 }}>
          <MiniBox label="Total Occ." value={today.total_occ_rooms ?? "—"} />
          <MiniBox label="Comp. Rooms" value={today.comp_rooms ?? "—"} />
          <MiniBox label="House Use" value={today.house_use_rooms ?? "—"} />
          <MiniBox label="Adl. & Chl." value={today.adl_chl ?? "—"} />
          <MiniBox label="Dep. Rooms" value={today.dep_rooms ?? "—"} />
          <MiniBox label="OOO Rooms" value={today.ooo_rooms ?? "—"} />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
        <MiniBox label="Min Occ." value={minMax.min.toFixed(2).replace(".", ",") + "%"} />
        <MiniBox label="Max Occ." value={minMax.max.toFixed(2).replace(".", ",") + "%"} />
      </div>

      <div style={{ border: `1px solid ${LINE}`, padding: "8px 10px 4px" }}>
        <div style={{ textAlign: "center", fontSize: 13, fontWeight: 600, color: "#7a162b", marginBottom: 6 }}>
          Ingresos por día &amp; Habitaciones ocupadas
        </div>
        <div style={{ height: 260 }}>
          <Chart
            type="bar"
            data={{
              labels: chartData.labels,
              datasets: [
                {
                  type: "bar" as const,
                  label: "Revenue",
                  data: chartData.revenue,
                  backgroundColor: barColors,
                  yAxisID: "y",
                },
                {
                  type: "line" as const,
                  label: "Hab. ocupadas",
                  data: chartData.occ,
                  borderColor: "#1f3a6e",
                  backgroundColor: "#1f3a6e",
                  borderWidth: 1.5,
                  tension: 0.2,
                  pointRadius: 2,
                  yAxisID: "y1",
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                y: { position: "left", beginAtZero: true, ticks: { callback: (v: any) => "US$" + (Number(v) / 1000).toFixed(0) + "k" } },
                y1: { position: "right", beginAtZero: true, grid: { display: false } },
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
