// app/components/hofModel.ts
export type HofKind = "History" | "Forecast";
export type HofFilter = HofKind | "All";

export type GlobalHotel = "MARRIOTT" | "SHERATON BCR" | "SHERATON MDQ" | "MAITEI";

export type HofRow = {
  // filtros
  empresa: string;         // valor original (crudo)
  empresaNorm: GlobalHotel; // normalizado para filtro
  hof: HofKind;

  // fecha
  date: Date;
  year: number;
  quarter: number; // 1..4
  month: number;   // 1..12
  day: number;     // 1..31
  dow: string;     // lunes/martes/...

  // métricas (numéricas ya parseadas)
  totalOcc: number;      // Total Occ.
  houseUse: number;      // House Use
  occPct01: number;      // Occ.% en 0..1
  roomRevenue: number;   // Room Revenue
  adr: number;           // Average Rate (ADR)
  persons: number;       // Adl. & Chl. (si existe)
};

function normStr(s: any) {
  return String(s ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function stripDiacritics(s: string) {
  // básico para dow y variantes
  return s
    .replace(/Á/g, "A")
    .replace(/É/g, "E")
    .replace(/Í/g, "I")
    .replace(/Ó/g, "O")
    .replace(/Ú/g, "U")
    .replace(/Ü/g, "U")
    .replace(/Ñ/g, "N");
}

export function toNumberSmart(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;

  const s = String(v).trim();
  if (!s) return 0;

  // quita comillas
  const raw = s.replace(/^"+|"+$/g, "").trim();

  // detecta % (lo devolvemos en número "normal", luego se pasa a 0..1)
  const cleaned = raw
    .replace(/\$/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")     // miles con punto
    .replace(",", ".")      // decimales con coma
    .replace("%", "");

  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function toPercent01FromAny(v: any): number {
  const n = toNumberSmart(v);
  // si ya viene 0..1, ok. si viene 59.4 => 0.594
  if (n > 1) return n / 100;
  if (n < 0) return 0;
  return n;
}

export function parseDatePreferFecha(row: Record<string, any>): Date | null {
  // preferimos "Fecha" (como pediste). Si no, "Date".
  const cand = row["Fecha"] ?? row["FECHA"] ?? row["Date"] ?? row["DATE"];
  if (!cand) return null;

  const s0 = String(cand).trim();

  // casos: "1/6/2022"
  // casos: "01-06-22 Wed"
  // casos: "01-06-22"
  // casos: "2022-06-01"
  const s = s0.split(" ")[0].trim(); // nos quedamos con la parte de fecha

  // ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s + "T00:00:00");
    return isNaN(d.getTime()) ? null : d;
  }

  // dd/mm/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("/").map((x) => Number(x));
    const d = new Date(yyyy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // dd-mm-yy o dd-mm-yyyy
  if (/^\d{1,2}-\d{1,2}-\d{2,4}$/.test(s)) {
    const [ddS, mmS, yyS] = s.split("-");
    const dd = Number(ddS);
    const mm = Number(mmS);
    let yy = Number(yyS);
    if (yyS.length === 2) yy = 2000 + yy;
    const d = new Date(yy, mm - 1, dd);
    return isNaN(d.getTime()) ? null : d;
  }

  // fallback Date.parse
  const d = new Date(s0);
  return isNaN(d.getTime()) ? null : d;
}

export function normalizeEmpresa(rawEmpresa: any): GlobalHotel {
  const s = stripDiacritics(normStr(rawEmpresa));

  // Marriott
  if (s.includes("MARRIOTT")) return "MARRIOTT";

  // Sheraton: separar BCR vs MDQ
  // si en el CSV viene "SHERATON BARILOCHE" -> BCR
  // si viene "SHERATON MAR DEL PLATA" -> MDQ
  if (s.includes("SHERATON")) {
    if (s.includes("BARILOCHE") || s.includes("BCR")) return "SHERATON BCR";
    if (s.includes("MAR DEL PLATA") || s.includes("MDQ")) return "SHERATON MDQ";
    // fallback: si no distingue, lo mandamos a MDQ? Mejor no: default a BCR es peligro.
    // elegimos MDQ si menciona "PLATA" o "MDQ", si no, BCR si menciona "BARILOCHE".
    // si no hay nada, mandamos a MDQ por seguridad (pero ideal: ajustar con el valor real del CSV).
    return "SHERATON MDQ";
  }

  // Maitei / Gotel
  if (s.includes("MAITEI") || s.includes("GOTEL") || s.includes("MANAGEMENT GOTEL")) return "MAITEI";

  // si no matchea: si estás trabajando solo con esos 4, lo consideramos MAITEI por defecto? NO.
  // Mejor default a MARRIOTT para no “perder” filas de JCR: pero tampoco.
  // Lo más seguro: si no coincide, asumimos MAITEI si el texto tiene POSADAS, sino MARRIOTT.
  if (s.includes("POSADAS")) return "MAITEI";
  return "MARRIOTT";
}

export function normalizeHof(raw: any): HofKind {
  const s = stripDiacritics(normStr(raw));
  if (s.includes("FORECAST")) return "Forecast";
  return "History";
}

export function normalizeDow(raw: any): string {
  const s = stripDiacritics(String(raw ?? "").trim().toLowerCase());
  // contemplamos valores raros (mi��rcole)
  if (s.startsWith("lun")) return "lunes";
  if (s.startsWith("mar")) return "martes";
  if (s.startsWith("mie") || s.startsWith("mi")) return "miércoles";
  if (s.startsWith("jue")) return "jueves";
  if (s.startsWith("vie")) return "viernes";
  if (s.startsWith("sab") || s.startsWith("sá")) return "sábado";
  if (s.startsWith("dom")) return "domingo";
  return s || "";
}

export function toHofRow(row: Record<string, any>): HofRow | null {
  const date = parseDatePreferFecha(row);
  if (!date) return null;

  const empresaRaw = row["Empresa"] ?? row["EMPRESA"] ?? row["Hotel"] ?? row["HOTEL"] ?? "";
  const empresaNorm = normalizeEmpresa(empresaRaw);

  const hofRaw = row["HoF"] ?? row["HOF"] ?? row["History/Forecast"] ?? row["HISTORY/FORECAST"] ?? "";
  const hof = normalizeHof(hofRaw);

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const quarter = Math.floor((month - 1) / 3) + 1;

  // campos del CSV que mostraste
  const totalOcc = toNumberSmart(row['Total Occ.'] ?? row['"Total\nOcc."'] ?? row["Total Occ"] ?? row["Total"]);
  const houseUse = toNumberSmart(row["House Use"] ?? row['"House\nUse"'] ?? row["House\nUse"]);
  const occPct01 = toPercent01FromAny(row["Occ.%"] ?? row["Occ%"] ?? row["Occ. %"] ?? row["Occ"]);
  const roomRevenue = toNumberSmart(row["Room Revenue"] ?? row["RoomRevenue"]);
  const adr = toNumberSmart(row["Average Rate"] ?? row["ADR"] ?? row["AverageRate"]);
  const persons = toNumberSmart(row['Adl. & Chl.'] ?? row['"Adl. &\nChl."'] ?? row["Adl. & Chl."] ?? row["Persons"]);

  const dowRaw = row["Día"] ?? row["Dia"] ?? row["D��"] ?? row["DoW"] ?? row["Day"] ?? "";
  const dow = normalizeDow(dowRaw);

  return {
    empresa: String(empresaRaw ?? ""),
    empresaNorm,
    hof,
    date,
    year,
    quarter,
    month,
    day,
    dow,
    totalOcc,
    houseUse,
    occPct01,
    roomRevenue,
    adr,
    persons,
  };
}
