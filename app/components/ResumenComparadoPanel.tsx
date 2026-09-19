"use client";

/**
 * "RESUMEN EJECUTIVO COMPARADO" — la pantalla principal del Power BI real:
 * las empresas del grupo lado a lado (Marriott / Sheraton MDQ / Sheraton
 * BCR para Panatel; Maitei / City Express para Numah), con el día de hoy,
 * más un bloque de Disponibilidades Totales arriba.
 *
 * Alcance de datos reales hoy:
 *  - Tasa Ocupación, Habitaciones vendidas, ADR, RevPar del día -> reales,
 *    de daily_metrics (mismo pipeline validado que el resto de la app).
 *  - Disponibilidades -> reales una vez que se carga bank_availability
 *    (migración 0005/0006 + carga de datos); si todavía no hay datos, el
 *    bloque lo indica en vez de mostrar un cero engañoso.
 *  - Ventas Totales / Huéspedes / Tasa Doble Ocupación / Ventas por rubro
 *    (Alojamiento / A&B / Diversas) NO están disponibles todavía: salen de
 *    otro reporte (Manager Flash / F116) que todavía no se parsea. Se
 *    muestran como "—" marcados, nunca inventados.
 */

import { useEffect, useMemo, useState } from "react";
import Gauge from "./pbi/Gauge";
import { MiniBox, DonutRubro } from "./pbi/MiniBox";
import { RED, INK, INK_SOFT, LINE, GREEN } from "./pbi/theme";

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
};

type DailyRow = {
  hotel_id: string;
  fecha: string;
  hof: "history" | "forecast";
  total_occ_rooms: number | null;
  room_revenue: number | null;
  occ_pct_reported: number | null;
  average_rate_reported: number | null;
};

type BankRow = {
  hotel_id: string;
  fecha: string;
  concepto: string;
  tipo_moneda: "ARS" | "USD" | "EUR";
  importe: number;
};

const fmtInt = (n: number) => Math.round(n).toLocaleString("es-AR");
const fmtUsd = (n: number) => "US$" + Math.round(n).toLocaleString("es-AR");
const fmtArs = (n: number) => n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

export default function ResumenComparadoPanel({ hotelFilter }: { hotelFilter: string }) {
  const [hotels, setHotels] = useState<Hotel[]>([]);
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [bank, setBank] = useState<BankRow[]>([]);
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
      fetch("/api/bank-availability", { cache: "no-store" }).then((r) => r.json()),
    ])
      .then(([h, k, d, b]) => {
        if (!alive) return;
        if (h.error || k.error || d.error) {
          setError(h.error || k.error || d.error);
        } else {
          setHotels(h.data ?? []);
          setKpis(k.data ?? []);
          setDaily(d.data ?? []);
          setBank(b.data ?? []);
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

  const hotelesFiltrados = useMemo(() => {
    if (hotelFilter === "ALL" || !hotelFilter) return hotels;
    const norm = hotelFilter.replace(/\s+/g, "_");
    const exact = hotels.filter((h) => h.code === norm || h.code === hotelFilter);
    return exact.length ? exact : hotels;
  }, [hotels, hotelFilter]);

  // día "de hoy" = último history de todo el set (mismo criterio que H&F)
  const hoyFecha = useMemo(() => {
    const fechas = daily.filter((d) => d.hof === "history").map((d) => d.fecha);
    return fechas.length ? fechas.sort().slice(-1)[0] : null;
  }, [daily]);

  const porHotel = useMemo(() => {
    return hotelesFiltrados.map((h) => {
      const hoy = hoyFecha ? daily.find((d) => d.hotel_id === h.id && d.fecha === hoyFecha) : undefined;
      const occRooms = hoy?.total_occ_rooms ?? 0;
      const revenue = hoy?.room_revenue ?? 0;
      const avail =
        hoy?.occ_pct_reported && hoy.occ_pct_reported > 0
          ? occRooms / (hoy.occ_pct_reported > 1 ? hoy.occ_pct_reported / 100 : hoy.occ_pct_reported)
          : 0;
      const occPct = avail > 0 ? (occRooms / avail) * 100 : 0;
      const adr = occRooms > 0 ? revenue / occRooms : 0;
      const revpar = avail > 0 ? revenue / avail : 0;

      const bankHotel = bank.filter((b) => b.hotel_id === h.id);
      const total = bankHotel.find((b) => b.concepto === "DISPONIBILIDADES" && b.tipo_moneda === "ARS")?.importe;
      const local = bankHotel.find((b) => b.concepto === "Moneda Local" && b.tipo_moneda === "ARS")?.importe;
      const extranjeraArs = bankHotel.find((b) => b.concepto === "Moneda extranjera" && b.tipo_moneda === "ARS")?.importe;
      const extranjeraUsd = bankHotel.find((b) => b.concepto === "Moneda extranjera" && b.tipo_moneda === "USD")?.importe;
      const extranjeraEur = bankHotel.find((b) => b.concepto === "Moneda extranjera" && b.tipo_moneda === "EUR")?.importe;

      return {
        hotel: h,
        occPct,
        occRooms,
        revpar,
        adr,
        disponibilidades: {
          total, local, extranjeraArs, extranjeraUsd, extranjeraEur,
          hayDatos: bankHotel.length > 0,
        },
      };
    });
  }, [hotelesFiltrados, daily, hoyFecha, bank]);

  const totalDisponibilidades = useMemo(() => {
    const totales = porHotel.map((p) => p.disponibilidades.total).filter((v): v is number => typeof v === "number");
    const locales = porHotel.map((p) => p.disponibilidades.local).filter((v): v is number => typeof v === "number");
    const extranjArs = porHotel.map((p) => p.disponibilidades.extranjeraArs).filter((v): v is number => typeof v === "number");
    const usd = porHotel.map((p) => p.disponibilidades.extranjeraUsd).filter((v): v is number => typeof v === "number");
    const eur = porHotel.map((p) => p.disponibilidades.extranjeraEur).filter((v): v is number => typeof v === "number");
    const suma = (arr: number[]) => arr.reduce((s, v) => s + v, 0);
    return {
      total: suma(totales),
      local: suma(locales),
      extranjeraArs: suma(extranjArs),
      usd: suma(usd),
      eur: suma(eur),
      hayDatos: porHotel.some((p) => p.disponibilidades.hayDatos),
    };
  }, [porHotel]);

  if (loading) return <div style={{ padding: 24, color: INK_SOFT }}>Cargando resumen comparado…</div>;
  if (error) return <div style={{ padding: 24, color: RED }}>No se pudo cargar el resumen: {error}</div>;

  return (
    <div style={{ display: "grid", gap: 14, fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
      {/* Bloque Disponibilidades Totales */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.1fr 1.2fr 1fr",
          gap: 10,
          border: `1px solid ${LINE}`,
          borderRadius: 8,
          overflow: "hidden",
        }}
      >
        <div style={{ background: GREEN, color: "white", padding: "10px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Total Disponibilidades</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>
            {totalDisponibilidades.hayDatos ? "$" + fmtArs(totalDisponibilidades.total) : "Sin datos cargados"}
          </div>
        </div>
        <div style={{ padding: "10px 14px", borderLeft: `1px solid ${LINE}` }}>
          <div style={{ fontSize: 11, color: INK_SOFT }}>Disponibilidades Moneda Extranjera (ARS)</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: INK }}>
            {totalDisponibilidades.hayDatos ? "$" + fmtArs(totalDisponibilidades.extranjeraArs) : "—"}
          </div>
          <div style={{ fontSize: 11, color: INK_SOFT, marginTop: 4 }}>Moneda local $</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: INK }}>
            {totalDisponibilidades.hayDatos ? "$" + fmtArs(totalDisponibilidades.local) : "—"}
          </div>
        </div>
        <div style={{ padding: "10px 14px", borderLeft: `1px solid ${LINE}`, display: "grid", gap: 6 }}>
          <div>
            <div style={{ fontSize: 11, color: INK_SOFT }}>USD</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>
              {totalDisponibilidades.hayDatos ? fmtInt(totalDisponibilidades.usd) : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: INK_SOFT }}>EUR</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: INK }}>
              {totalDisponibilidades.hayDatos ? fmtInt(totalDisponibilidades.eur) : "—"}
            </div>
          </div>
        </div>
      </div>
      {!totalDisponibilidades.hayDatos && (
        <div style={{ fontSize: 11, color: INK_SOFT, marginTop: -8 }}>
          Todavía no hay Disponibilidades Bancarias cargadas en Supabase — corré la migración y subí los datos de Panatel/Numah para que este bloque muestre números reales.
        </div>
      )}

      {/* Cards por hotel */}
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, porHotel.length)}, 1fr)`, gap: 12 }}>
        {porHotel.map(({ hotel, occPct, occRooms, revpar, adr }) => (
          <div key={hotel.id} style={{ border: `1px solid ${LINE}`, borderRadius: 8, overflow: "hidden", background: "white" }}>
            <div style={{ background: RED, color: "white", padding: "8px 12px", fontWeight: 700, fontSize: 13, letterSpacing: "0.02em" }}>
              {hotel.name}
            </div>
            <div style={{ padding: 12, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <Gauge label="Tasa Ocupación" valuePct={occPct} color={occPct >= 50 ? GREEN : RED} size={110} />
                <div style={{ display: "grid", gap: 8 }}>
                  <MiniBox label="Habitaciones vendidas" value={fmtInt(occRooms)} />
                  <MiniBox label="Huéspedes" value="—" pending />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <MiniBox label="ADR" value={fmtUsd(adr)} />
                <MiniBox label="RevPar" value={fmtUsd(revpar)} />
                <MiniBox label="Tasa doble ocup." value="—" pending />
              </div>
              <div>
                <div style={{ fontSize: 11, color: INK_SOFT, textAlign: "center", marginBottom: 4 }}>Ventas por rubro</div>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <DonutRubro alojamiento={0} ayb={0} diversas={0} />
                </div>
                <div style={{ fontSize: 10, color: "#b7b7b7", textAlign: "center" }}>
                  Pendiente: fuente Manager Flash / ventas por rubro
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
