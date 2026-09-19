"""
Pipeline de automatización de PDFs — reemplaza el paso manual diario
(bajar PDF de Gmail -> pasar a Excel -> subir a la base que lee Power BI).

Flujo:
  1. fetch_new_pdfs()   — busca PDFs nuevos en la casilla de Gmail (agencialtelc@gmail.com)
  2. stage_pdf()        — guarda el PDF en Supabase Storage y crea una fila en pdf_ingestions
  3. parse_pdf()        — extrae los campos del PDF a un dict (ESTO ES LO QUE FALTA DEFINIR)
  4. apply_to_metrics() — valida + corre el detector de anomalías + hace upsert en daily_metrics

Por qué está en piezas separadas: si el parser falla o el hotel manda un PDF
con formato distinto, la fila queda en pdf_ingestions con status='needs_review'
y NO se pierde el archivo original — alguien la revisa a mano una vez, y ese
caso se puede sumar al parser para la próxima vez. Es exactamente lo que un
"tirale el PDF a Claude sin más" no te da: un rastro auditable de qué se
cargó, cuándo, y desde qué archivo exacto.

IMPORTANTE — lo que falta para que esto corra de verdad:
  Necesito 2-3 PDFs reales de ejemplo (uno por hotel si el formato cambia
  entre Marriott/Sheraton/Maitei/City Express) para escribir parse_pdf().
  Hoy esa función es un stub: define la INTERFAZ (qué entra, qué tiene que
  salir) pero no la extracción real todavía.
"""
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

import pdfplumber

# ---------------------------------------------------------------------------
# Mapeo de layouts de columnas del reporte R106 (validado contra 10 PDFs
# reales: Marriott, Sheraton Mar del Plata y Sheraton Bariloche, distintos
# meses, con y sin sección "History"). Ver scripts/parse_r106_dev.py para el
# detalle de cómo se llegó a este diseño -- se deja acá porque es el que
# corre en el pipeline real; el script en scripts/ queda como prototipo de
# referencia/testing manual sobre PDFs nuevos.
# ---------------------------------------------------------------------------

HOTEL_NAME_TO_CODE = {
    "buenos aires marriott": "MARRIOTT",
    "sheraton mar del plata hotel": "SHERATON_MDQ",
    "sheraton mar del plata": "SHERATON_MDQ",
    "sheraton bariloche": "SHERATON_BCR",
    "city express plus": "CITY_EXPRESS_PLUS",
    "maitei posadas": "MAITEI",
}

_DATE_RE = re.compile(r"^\d{2}-\d{2}-\d{2}$")
_WEEKDAY_RE = re.compile(r"^[A-Za-z]{3}$")

_STANDARD_14 = [
    "total_occ_rooms", "arr_rooms", "comp_rooms", "house_use_rooms",
    "deduct_indiv", "deduct_group", "occ_pct_reported", "room_revenue",
    "average_rate_reported", "dep_rooms", "day_use_rooms", "no_show_rooms",
    "ooo_rooms", "adl_chl",
]
_WITH_NONDED_16 = [
    "total_occ_rooms", "arr_rooms", "comp_rooms", "house_use_rooms",
    "deduct_indiv", "non_ded_indiv", "deduct_group", "non_ded_group",
    "occ_pct_reported", "room_revenue", "average_rate_reported",
    "dep_rooms", "day_use_rooms", "no_show_rooms", "ooo_rooms", "adl_chl",
]
# Reportes 100% forecast (mes futuro sin días "History" todavía) nunca
# tienen valor en No Show Rooms, ni siquiera en la fila de gran total,
# porque el concepto no existe hasta que la fecha ya pasó.
_R106_LAYOUTS = {
    14: _STANDARD_14,
    16: _WITH_NONDED_16,
    13: [f for f in _STANDARD_14 if f != "no_show_rooms"],
    15: [f for f in _WITH_NONDED_16 if f != "no_show_rooms"],
}


def _r106_hotel_code(page) -> tuple[Optional[str], str]:
    top_words = sorted([w for w in page.extract_words() if w["top"] < 20], key=lambda w: w["x0"])
    name_words = []
    for w in top_words:
        if _DATE_RE.match(w["text"]) or re.match(r"^\d{2}:\d{2}$", w["text"]):
            break
        name_words.append(w["text"])
    name = " ".join(name_words).strip().lower()
    return HOTEL_NAME_TO_CODE.get(name), name


def _r106_group_rows(words, top_tolerance=3):
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


def _r106_parse_value(text: str):
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


def _r106_parse_fecha(fecha_str: str) -> date:
    # formato del reporte: dd-mm-aa (año a 2 dígitos)
    return datetime.strptime(fecha_str, "%d-%m-%y").date()


# ---------------------------------------------------------------------------
# 1. Traer PDFs nuevos de Gmail
# ---------------------------------------------------------------------------

def fetch_new_pdfs(since_message_id: Optional[str] = None) -> list[dict]:
    """
    Busca en agencialtelc@gmail.com los mensajes con PDF adjunto que todavía
    no están en pdf_ingestions (por gmail_message_id).

    TODO: implementar con la API de Gmail (OAuth, no usuario/contraseña —
    Google lo bloquea). Requiere:
      - Un proyecto en Google Cloud Console con Gmail API habilitada
      - Credenciales OAuth (o una cuenta de servicio con domain-wide delegation
        si agencialtelc@gmail.com pasa a ser un Workspace)
      - Un filtro de búsqueda (remitente conocido por hotel, o asunto)

    Devuelve una lista de dicts: [{'message_id', 'from', 'subject',
    'received_at', 'attachment_bytes', 'filename'}, ...]
    """
    raise NotImplementedError(
        "Falta configurar credenciales de Gmail API. "
        "Ver docs/pdf-automation-setup.md"
    )


# ---------------------------------------------------------------------------
# 2. Guardar el PDF y dejar constancia en la base (staging)
# ---------------------------------------------------------------------------

def stage_pdf(message: dict, hotel_code: Optional[str], supabase_client) -> str:
    """
    Sube el PDF a Supabase Storage (bucket 'pdf-ingestions') y crea la fila
    en pdf_ingestions con status='received'. hotel_code puede venir None si
    todavía no se identificó el hotel emisor (se completa en parse_pdf).

    Devuelve el id de la fila creada en pdf_ingestions.
    """
    storage_path = f"{message['received_at'].date().isoformat()}/{message['filename']}"

    supabase_client.storage.from_('pdf-ingestions').upload(
        storage_path, message['attachment_bytes'],
        file_options={'content-type': 'application/pdf'}
    )

    hotel_id = None
    if hotel_code:
        hotel = supabase_client.table('hotels').select('id').eq('code', hotel_code).single().execute()
        hotel_id = hotel.data['id'] if hotel.data else None

    row = supabase_client.table('pdf_ingestions').insert({
        'hotel_id': hotel_id,
        'gmail_message_id': message['message_id'],
        'received_at': message['received_at'].isoformat(),
        'storage_path': storage_path,
        'status': 'received',
    }).execute()

    return row.data[0]['id']


# ---------------------------------------------------------------------------
# 3. Parsear el PDF a los campos que necesita daily_metrics
# ---------------------------------------------------------------------------

@dataclass
class ParsedDailyMetric:
    hotel_code: str
    fecha: date
    hof: str  # 'history' | 'forecast'
    total_occ_rooms: Optional[float] = None
    arr_rooms: Optional[float] = None
    comp_rooms: Optional[float] = None
    house_use_rooms: Optional[float] = None
    dep_rooms: Optional[float] = None
    day_use_rooms: Optional[float] = None
    no_show_rooms: Optional[float] = None
    ooo_rooms: Optional[float] = None
    room_revenue: Optional[float] = None
    average_rate_reported: Optional[float] = None
    occ_pct_reported: Optional[float] = None


def parse_pdf(pdf_bytes: bytes) -> list[ParsedDailyMetric]:
    """
    Parser real del reporte OPERA **R106 History and Forecast** — el que hoy
    se pasa a mano al Excel todos los días. Validado contra 10 PDFs reales
    (Marriott Buenos Aires, Sheraton Mar del Plata, Sheraton Bariloche;
    varios meses; con y sin sección "History" según la fecha del reporte).

    Por qué no usar el texto plano tal cual: pdfplumber (y cualquier
    extractor de texto) devuelve las palabras del PDF agrupadas por columna,
    no por fila -- hay que reconstruir cada fila a partir de la posición
    (x, y) de cada palabra. La fila de "Total" (gran total al pie del
    reporte) sirve como ancla confiable de las posiciones x de cada columna,
    porque en general tiene un valor en cada una -- salvo un caso ya visto:
    un reporte 100% a futuro (sin ningún día ya pasado) nunca tiene valor en
    "No Show Rooms", así que para ese caso hay un layout de respaldo con esa
    columna ausente (ver _R106_LAYOUTS).

    Si el layout de columnas no matchea ninguno de los conocidos (por
    ejemplo, un hotel/formato nuevo que agrega columnas), la función no
    adivina: devuelve una lista vacía y quien llama debe marcar la
    ingestión como 'needs_review' con el detalle para revisar a mano y
    sumar el layout nuevo acá.

    Devuelve una lista de ParsedDailyMetric, una por cada día (History +
    Forecast) presente en el PDF.
    """
    results: list[ParsedDailyMetric] = []

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        for page in pdf.pages:
            hotel_code, hotel_name_raw = _r106_hotel_code(page)
            if hotel_code is None:
                # No perdemos el archivo: quien llama debe marcar needs_review
                # con hotel_name_raw para poder sumar el mapeo la próxima vez.
                raise ValueError(
                    f"Hotel no reconocido en el encabezado del PDF: '{hotel_name_raw}'. "
                    "Sumar a HOTEL_NAME_TO_CODE en pdf_pipeline.py."
                )

            words = page.extract_words()
            all_rows = _r106_group_rows([w for w in words if w["top"] > 85])

            anchor_row = None
            for r in all_rows:
                if r["words"][0]["text"] == "Total" and len(r["words"]) > 1:
                    anchor_row = r
                    break
            if anchor_row is None:
                raise ValueError("No se encontró la fila de 'Total' -- no se pueden anclar las columnas.")

            anchors = [w["x0"] for w in anchor_row["words"][1:]]
            layout = _R106_LAYOUTS.get(len(anchors))
            if layout is None:
                raise ValueError(
                    f"Layout de {len(anchors)} columnas no reconocido en este PDF "
                    "(¿un hotel o formato nuevo? revisar a mano y sumar el layout)."
                )
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
                if not _DATE_RE.match(first_text):
                    continue

                values = {}
                data_words = [w for w in rw[1:] if not _WEEKDAY_RE.match(w["text"])]
                for w in data_words:
                    field = min(col_anchors, key=lambda c: abs(c[0] - w["x0"]))[1]
                    values[field] = _r106_parse_value(w["text"])

                results.append(ParsedDailyMetric(
                    hotel_code=hotel_code,
                    fecha=_r106_parse_fecha(first_text),
                    hof=current_hof or "history",
                    total_occ_rooms=values.get("total_occ_rooms"),
                    arr_rooms=values.get("arr_rooms"),
                    comp_rooms=values.get("comp_rooms"),
                    house_use_rooms=values.get("house_use_rooms"),
                    dep_rooms=values.get("dep_rooms"),
                    day_use_rooms=values.get("day_use_rooms"),
                    no_show_rooms=values.get("no_show_rooms"),
                    ooo_rooms=values.get("ooo_rooms"),
                    room_revenue=values.get("room_revenue"),
                    average_rate_reported=values.get("average_rate_reported"),
                    occ_pct_reported=values.get("occ_pct_reported"),
                ))

    return results


# ---------------------------------------------------------------------------
# 4. Validar y aplicar a daily_metrics
# ---------------------------------------------------------------------------

def detect_anomalies(metric: ParsedDailyMetric, supabase_client) -> list[str]:
    """
    Corre el mismo tipo de chequeo que hicimos a mano sobre H_F.xlsx:
    outliers de tarifa, ocupación fuera de rango, revenue negativo no
    explicado. Devuelve una lista de motivos de alerta (vacía si está OK).

    La comparación es contra el propio historial del hotel en la base
    (percentiles de ADR de los últimos ~90 días), no contra un umbral fijo
    — así se adapta a la estacionalidad de cada propiedad (Bariloche en
    temporada alta no dispara falsos positivos).
    """
    alerts = []

    if metric.average_rate_reported is not None:
        hist = supabase_client.rpc('adr_percentiles_last_90d', {
            'p_hotel_code': metric.hotel_code
        }).execute()
        if hist.data:
            p25, p75 = hist.data[0]['p25'], hist.data[0]['p75']
            iqr = p75 - p25
            hi = p75 + 3 * iqr
            if metric.average_rate_reported > hi or metric.average_rate_reported <= 0:
                alerts.append(
                    f"ADR reportado ({metric.average_rate_reported}) fuera de rango "
                    f"esperado (hasta {hi:.0f} según los últimos 90 días)"
                )

    if metric.occ_pct_reported is not None and not (0 <= metric.occ_pct_reported <= 1):
        alerts.append(f"Occ% fuera de rango 0-1: {metric.occ_pct_reported}")

    return alerts


def apply_to_metrics(ingestion_id: str, metric: ParsedDailyMetric, supabase_client) -> dict:
    """
    Corre detect_anomalies(); si hay alertas, deja la ingestión en
    'needs_review' (no se aplica sola, alguien la confirma). Si está limpia,
    hace upsert en daily_metrics (source='pdf_automation') y marca la
    ingestión como 'applied'.
    """
    alerts = detect_anomalies(metric, supabase_client)

    if alerts:
        supabase_client.table('pdf_ingestions').update({
            'status': 'needs_review',
            'parsed_payload': metric.__dict__,
            'error_message': '; '.join(alerts),
        }).eq('id', ingestion_id).execute()
        return {'status': 'needs_review', 'alerts': alerts}

    hotel = supabase_client.table('hotels').select('id').eq('code', metric.hotel_code).single().execute()

    upserted = supabase_client.table('daily_metrics').upsert({
        'hotel_id': hotel.data['id'],
        'fecha': metric.fecha.isoformat(),
        'hof': metric.hof,
        'total_occ_rooms': metric.total_occ_rooms,
        'arr_rooms': metric.arr_rooms,
        'comp_rooms': metric.comp_rooms,
        'house_use_rooms': metric.house_use_rooms,
        'dep_rooms': metric.dep_rooms,
        'day_use_rooms': metric.day_use_rooms,
        'no_show_rooms': metric.no_show_rooms,
        'ooo_rooms': metric.ooo_rooms,
        'room_revenue': metric.room_revenue,
        'average_rate_reported': metric.average_rate_reported,
        'occ_pct_reported': metric.occ_pct_reported,
        'source': 'pdf_automation',
    }, on_conflict='hotel_id,fecha,hof').execute()

    supabase_client.table('pdf_ingestions').update({
        'status': 'applied',
        'parsed_payload': metric.__dict__,
        'applied_at': 'now()',
        'applied_metric_id': upserted.data[0]['id'],
    }).eq('id', ingestion_id).execute()

    return {'status': 'applied', 'daily_metric_id': upserted.data[0]['id']}


# ---------------------------------------------------------------------------
# Orquestación diaria (para correr desde un cron/scheduled task)
# ---------------------------------------------------------------------------

def run_daily_ingestion(supabase_client):
    messages = fetch_new_pdfs()
    results = []
    for msg in messages:
        ingestion_id = stage_pdf(msg, hotel_code=None, supabase_client=supabase_client)
        try:
            metrics = parse_pdf(msg['attachment_bytes'])
            for metric in metrics:
                results.append(apply_to_metrics(ingestion_id, metric, supabase_client))
        except NotImplementedError as e:
            supabase_client.table('pdf_ingestions').update({
                'status': 'failed', 'error_message': str(e),
            }).eq('id', ingestion_id).execute()
    return results
