// app/components/xlsxClient.ts
export type XlsxRow = Record<string, any>;

type ReadXlsxResult = {
  sheetName: string;
  rows: XlsxRow[];
};

/**
 * Lee un XLSX desde /public (ej: /data/jcr_membership.xlsx)
 * y devuelve la primera sheet (o la indicada) en JSON.
 *
 * Requiere que el paquete "xlsx" exista en tu proyecto.
 */
export async function readXlsxFromPublic(path: string, preferredSheetName?: string): Promise<ReadXlsxResult> {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`No se pudo leer XLSX: ${path} (${res.status})`);

  const buf = await res.arrayBuffer();

  // dynamic import para evitar problemas en SSR
  const XLSX = await import("xlsx");

  const wb = XLSX.read(buf, { type: "array" });
  const sheetName =
    (preferredSheetName && wb.SheetNames.includes(preferredSheetName) ? preferredSheetName : undefined) ??
    wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<XlsxRow>(ws, { defval: "" });

  return { sheetName, rows };
}
