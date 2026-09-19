import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";

function norm(v: any) {
  return String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pickHeaderIndex(headers: string[], candidates: string[]) {
  for (const c of candidates) {
    const i = headers.findIndex((h) => h === c);
    if (i >= 0) return i;
  }
  for (const c of candidates) {
    const i = headers.findIndex((h) => h.includes(c));
    if (i >= 0) return i;
  }
  return -1;
}

type Row = { year: number; hotel: string; segment: string; count: number };

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const file = url.searchParams.get("file") || "data/jcr_membership.xlsx";

    // seguridad simple
    if (!file.startsWith("data/") || file.includes("..")) {
      return NextResponse.json({ error: "file inválido" }, { status: 400 });
    }

    const fileAbs = path.join(process.cwd(), "public", file);
    if (!fs.existsSync(fileAbs)) {
      return NextResponse.json(
        { error: `No existe public/${file}` },
        { status: 404 }
      );
    }

    const allowedHotelsRaw = url.searchParams.get("allowedHotels") || "";
    const allowedHotels = allowedHotelsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(norm);

    const XLSX = await import("xlsx");
    const buf = fs.readFileSync(fileAbs);
    const wb = XLSX.read(buf, { type: "buffer" });

    const out: Row[] = [];

    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;

      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][];
      if (!aoa || aoa.length < 2) continue;

      // buscar header
      let headerRowIdx = 0;
      for (let r = 0; r < Math.min(12, aoa.length); r++) {
        const filled = (aoa[r] || []).filter((x) => String(x ?? "").trim() !== "").length;
        if (filled >= 3) {
          headerRowIdx = r;
          break;
        }
      }

      const headers = (aoa[headerRowIdx] || []).map((h) => norm(h));

      const idxYear = pickHeaderIndex(headers, ["ano", "anio", "year", "fecha", "periodo"]);
      const idxHotel = pickHeaderIndex(headers, ["hotel", "property", "empresa", "unidad", "establecimiento"]);
      const idxSeg = pickHeaderIndex(headers, ["membership", "membresia", "tier", "level", "categoria", "segmento"]);
      const idxCount = pickHeaderIndex(headers, ["count", "cantidad", "members", "miembros", "socios", "qty", "total"]);

      if (idxHotel < 0 || idxSeg < 0 || idxCount < 0) continue;

      for (let r = headerRowIdx + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];

        const hotel = String(row[idxHotel] ?? "").trim();
        const segment = String(row[idxSeg] ?? "").trim();
        if (!hotel || !segment) continue;

        const rawCount = row[idxCount];
        const count =
          typeof rawCount === "number"
            ? rawCount
            : Number(String(rawCount ?? "").replace(/\./g, "").replace(",", "."));
        if (!Number.isFinite(count)) continue;

        let y = 0;
        if (idxYear >= 0) {
          const s = String(row[idxYear] ?? "").trim();
          const m = s.match(/(20\d{2})/);
          y = m ? Number(m[1]) : Number(s);
        }
        if (!y || !Number.isFinite(y)) {
          const m2 = sheetName.match(/(20\d{2})/);
          y = m2 ? Number(m2[1]) : 0;
        }
        if (!y) continue;

        // filtro hoteles si viene la lista
        if (allowedHotels.length > 0) {
          const h = norm(hotel);
          const ok = allowedHotels.some((t) => h === t || h.includes(t) || t.includes(h));
          if (!ok) continue;
        }

        out.push({ year: y, hotel, segment, count });
      }
    }

    return NextResponse.json({ rows: out });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Error" }, { status: 500 });
  }
}
