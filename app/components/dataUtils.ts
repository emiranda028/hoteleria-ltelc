// app/components/dataUtils.ts
export const JCR_HOTELS = ["MARRIOTT", "SHERATON BCR", "SHERATON MDQ"] as const;

export type GlobalHotel = "JCR" | "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

export function normStr(v: any): string {
  return String(v ?? "").trim();
}

export function normUpper(v: any): string {
  return normStr(v).toUpperCase();
}

export function normalizeHotel(raw: any): string {
  const s = normUpper(raw);

  // normalizaciones típicas
  if (!s) return "";
  if (s.includes("MARRIOTT")) return "MARRIOTT";
  if (s.includes("SHERATON") && (s.includes("BRC") || s.includes("BCR") || s.includes("BARILOCHE")))
    return "SHERATON BCR";
  if (s.includes("SHERATON") && (s.includes("MDQ") || s.includes("MAR DEL PLATA")))
    return "SHERATON MDQ";
  if (s.includes("MAITEI")) return "MAITEI";

  // si ya viene bien
  if (s === "SHERATON BCR") return "SHERATON BCR";
  if (s === "SHERATON MDQ") return "SHERATON MDQ";

  return s;
}

export function hotelMatches(rowHotelRaw: any, selected: GlobalHotel): boolean {
  const rowHotel = normalizeHotel(rowHotelRaw);
  if (!rowHotel) return false;

  if (selected === "JCR") return (JCR_HOTELS as readonly string[]).includes(rowHotel);
  return rowHotel === selected;
}

// Parse numérico robusto (ej "5.251.930,33" -> 5251930.33 / "22.441,71" -> 22441.71)
export function toNumber(value: any): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const s = String(value).trim();
  if (!s) return 0;

  // quita símbolos y espacios raros
  const cleaned = s
    .replace(/\$/g, "")
    .replace(/USD/gi, "")
    .replace(/\s/g, "")
    .replace(/\u00A0/g, "");

  // si tiene coma y punto, asumimos formato es-AR: 1.234.567,89
  if (cleaned.includes(",") && cleaned.includes(".")) {
    const x = cleaned.replace(/\./g, "").replace(/,/g, ".");
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }

  // si solo tiene coma: "1234,56"
  if (cleaned.includes(",") && !cleaned.includes(".")) {
    const n = Number(cleaned.replace(/,/g, "."));
    return Number.isFinite(n) ? n : 0;
  }

  // default
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// Fecha segura: soporta Excel serial, dd/mm/yyyy, dd-mm-yy, etc.
export function getDateSafe(value: any): Date | null {
  if (!value) return null;

  // Excel serial date
  if (typeof value === "number") {
    const d = new Date(Math.round((value - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }

  const s = String(value).trim();
  if (!s) return null;

  // dd-mm-yy / dd-mm-yyyy o dd/mm/yy / dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yy = m[3].length === 2 ? Number("20" + m[3]) : Number(m[3]);
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // fallback Date()
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function getYearSafe(value: any): number | null {
  const d = getDateSafe(value);
  if (!d) return null;
  return d.getFullYear();
}

export function getMonthSafe(value: any): number | null {
  const d = getDateSafe(value);
  if (!d) return null;
  return d.getMonth() + 1; // 1..12
}

export const MONTHS_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
] as const;

export function monthNameEs(m: number): string {
  if (m >= 1 && m <= 12) return MONTHS_ES[m - 1];
  return String(m);
}
