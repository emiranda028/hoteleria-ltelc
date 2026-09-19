"""
Prototipo de extracción para reportes R106 History and Forecast (PDF).
Uso: python3 scripts/parse_r106_dev.py <ruta.pdf>

Estrategia (validada contra 7 PDFs reales: Marriott x3 meses, Sheraton
Bariloche x3 meses, Sheraton Mar del Plata x1 mes):

  1. El texto que devuelve pdfplumber viene por palabra con su posición
     (x0, top) — no hay que asumir orden de lectura fila por fila.
  2. Usamos la fila de "Total" (el gran total al pie del reporte) como
     fuente de verdad de las posiciones x de cada columna: esa fila SIEMPRE
     tiene un valor en cada columna (nunca vacía), a diferencia de las filas
     de forecast que a veces omiten "No Show Rooms".
  3. El número de columnas de esa fila (14 o 16) determina el layout:
     - 14 columnas: layout estándar (Marriott, Sheraton Bariloche)
     - 16 columnas: layout con Non-Ded. Indiv./Group (Sheraton Mar del Plata)
     Si aparece un layout con otro número de columnas, lo marcamos
     explícitamente como desconocido en vez de adivinar.
  4. Cada fila de datos (fecha dd-mm-aa) asigna cada palabra numérica a la
     columna cuyo ancla x está más cerca — esto tolera columnas vacías
     (ancla sin palabra cerca) sin desalinear el resto.
  5. "History"/"Forecast" son etiquetas sueltas en la columna Date que
     marcan la sección de las filas siguientes.
  6. Filas "Subtotal"/"Total" se excluyen de los datos (son agregados).
  7. El hotel se identifica por el nombre en el encabezado de la página.
"""
import re
import sys
from dataclasses import dataclass, asdict
from typing import Optional

import pdfplumber

HOTEL_NAME_TO_CODE = {
    "buenos aires marriott": "MARRIOTT",
    "sheraton mar del plata hotel": "SHERATON_MDQ",
    "sheraton mar del plata": "SHERATON_MDQ",
    "sheraton bariloche": "SHERATON_BCR",
    "city express plus": "CITY_EXPRESS",
    "maitei posadas": "MAITEI",
}

DATE_RE = re.compile(r"^\d{2}-\d{2}-\d{2}$")
WEEKDAY_RE = re.compile(r"^[A-Za-z]{3}$")

STANDARD_14 = [
    "total_occ_rooms", "arr_rooms", "comp_rooms", "house_use_rooms",
    "deduct_indiv", "deduct_group", "occ_pct_reported", "room_revenue",
    "average_rate_reported", "dep_rooms", "day_use_rooms", "no_show_rooms",
    "ooo_rooms", "adl_chl",
]

WITH_NONDED_16 = [
    "total_occ_rooms", "arr_rooms", "comp_rooms", "house_use_rooms",
    "deduct_indiv", "non_ded_indiv", "deduct_group", "non_ded_group",
    "occ_pct_reported", "room_revenue", "average_rate_reported",
    "dep_rooms", "day_use_rooms", "no_show_rooms", "ooo_rooms", "adl_chl",
]

# Reportes 100% forecast (mes futuro, sin ningún día de "History" todavía)
# nunca tienen valor en No Show Rooms -- ni siquiera en la fila de gran total --
# porque el concepto no existe hasta que la fecha ya pasó. En ese caso la fila
# de anclaje aparece con una columna menos, en el mismo orden, salvo por esa.
STANDARD_13_NO_SHOW = [f for f in STANDARD_14 if f != "no_show_rooms"]
WITH_NONDED_15_NO_SHOW = [f for f in WITH_NONDED_16 if f != "no_show_rooms"]

LAYOUTS = {
    14: STANDARD_14,
    16: WITH_NONDED_16,
    13: STANDARD_13_NO_SHOW,
    15: WITH_NONDED_15_NO_SHOW,
}


@dataclass
class ParsedRow:
    hotel_code: Optional[str]
    hotel_name_raw: str
    fecha: str
    hof: Optional[str]
    total_occ_rooms: Optional[float] = None
    arr_rooms: Optional[float] = None
    comp_rooms: Optional[float] = None
    house_use_rooms: Optional[float] = None
    deduct_indiv: Optional[float] = None
    non_ded_indiv: Optional[float] = None
    deduct_group: Optional[float] = None
    non_ded_group: Optional[float] = None
    occ_pct_reported: Optional[float] = None
    room_revenue: Optional[float] = None
    average_rate_reported: Optional[float] = None
    dep_rooms: Optional[float] = None
    day_use_rooms: Optional[float] = None
    no_show_rooms: Optional[float] = None
    ooo_rooms: Optional[float] = None
    adl_chl: Optional[float] = None


def extract_hotel_code(page):
    top_words = sorted([w for w in page.extract_words() if w["top"] < 20], key=lambda w: w["x0"])
    name_words = []
    for w in top_words:
        if DATE_RE.match(w["text"]) or re.match(r"^\d{2}:\d{2}$", w["text"]):
            break
        name_words.append(w["text"])
    name = " ".join(name_words).strip().lower()
    return HOTEL_NAME_TO_CODE.get(name), name


def group_rows(words, top_tolerance=3):
    """Agrupa palabras en filas por cercanía de 'top' (tolera pequeño jitter)."""
    rows = []
    for w in sorted(words, key=lambda w: w["top"]):
        if rows and abs(w["top"] - rows[-1]["top"]) <= top_tolerance:
            rows[-1]["words"].append(w)
            rows[-1]["top"] = (rows[-1]["top"] + w["top"]) / 2
        else:
            rows.append({"top": w["top"], "words": [w]})
    for r in rows:
        r["words"].sort(key=lambda w: w["x0"])
    return rows


def parse_value(text):
    text = text.replace(",", "")
    if text.endswith("%"):
        try:
            return float(text[:-1]) / 100.0
        except ValueError:
            return None
    try:
        return float(text)
    except ValueError:
        return None


def parse_r106(pdf_path):
    rows_out = []
    warnings = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            hotel_code, hotel_name_raw = extract_hotel_code(page)
            words = page.extract_words()
            all_rows = group_rows([w for w in words if w["top"] > 85])

            # 1. localizar la fila "Total" (gran total) para sacar los anclajes de columna
            anchors = None
            for r in all_rows:
                if r["words"][0]["text"] == "Total" and len(r["words"]) > 1:
                    anchors = [w["x0"] for w in r["words"][1:]]
                    break
            if anchors is None:
                warnings.append(f"{pdf_path}: no se encontró fila 'Total' — no se puede anclar columnas")
                continue

            layout = LAYOUTS.get(len(anchors))
            if layout is None:
                warnings.append(
                    f"{pdf_path}: layout con {len(anchors)} columnas no reconocido "
                    f"(valores: {[w['text'] for w in r['words'][1:]]})"
                )
                continue

            col_anchors = list(zip(anchors, layout))

            current_hof = None
            for r in all_rows:
                rw = r["words"]
                first_text = rw[0]["text"]

                if first_text in ("History", "Forecast") and len(rw) == 1:
                    current_hof = first_text.lower()
                    continue
                if first_text in ("Subtotal", "Total", "Grand"):
                    continue
                if not DATE_RE.match(first_text):
                    continue

                rec = ParsedRow(hotel_code=hotel_code, hotel_name_raw=hotel_name_raw,
                                 fecha=first_text, hof=current_hof)
                data_words = [w for w in rw[1:] if not WEEKDAY_RE.match(w["text"])]
                for w in data_words:
                    field = min(col_anchors, key=lambda c: abs(c[0] - w["x0"]))[1]
                    setattr(rec, field, parse_value(w["text"]))
                rows_out.append(rec)

    return rows_out, warnings


if __name__ == "__main__":
    path = sys.argv[1]
    rows, warnings = parse_r106(path)
    for w in warnings:
        print("WARNING:", w)
    print(f"Total filas: {len(rows)}")
    if rows:
        print("Hotel:", rows[0].hotel_code, "|", rows[0].hotel_name_raw)
        hist = sum(1 for r in rows if r.hof == "history")
        fcst = sum(1 for r in rows if r.hof == "forecast")
        print(f"history={hist} forecast={fcst}")
        print("Primera fila:", asdict(rows[0]))
        print("Última fila:", asdict(rows[-1]))
