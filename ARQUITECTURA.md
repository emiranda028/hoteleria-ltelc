# Portal LTELC — arquitectura de base de datos, auth y automatización

Este documento es el punto de partida para levantar el backend real
(hoy corrido y validado contra un Postgres local; falta conectarlo a un
proyecto Supabase de verdad, que es donde va a vivir en producción).

## 1. Qué se construyó y por qué

Hasta ahora `hoteles-main` era 100% frontend: leía CSVs/XLSX locales, sin
login, sin base de datos, un solo dashboard para todos. Esto ya no alcanza
porque:

- Panatel y Numah necesitan ver **cada uno solo sus propios hoteles**.
- Los cálculos (ADR, Occ, RevPAR) vivían en fórmulas sueltas de Excel,
  donde un solo error de tipeo distorsiona meses enteros (como el que
  encontramos y corregimos a mano en H_F.xlsx).
- La carga de datos es 100% manual (PDF → Excel → subir), todos los días.

La solución tiene tres capas, en `supabase/migrations/`:

1. **`0001_init.sql`** — el schema: `organizations` (Panatel, Numah, LTELC),
   `hotels`, `profiles` (usuarios + rol + organización), `daily_metrics`
   (reemplaza la hoja H&F), `data_quality_flags`, `pdf_ingestions`
   (staging del pipeline de automatización), `guest_nationality`,
   `forecast_snapshots` (para poder medir precisión de forecast a futuro,
   algo que hoy es imposible porque nunca se guardó el pace histórico).

2. **`0002_calc_views.sql`** — el motor de cálculo. `v_monthly_kpis_calc`
   y `v_management_indices` recalculan todo ponderado por ingresos/
   habitaciones reales (nunca promediando tarifas diarias sueltas) y
   excluyen automáticamente cualquier fila marcada `is_excluded=true`.
   **Validado**: los números que devuelven estas vistas sobre los datos
   reales de H_F.xlsx coinciden exactos con los que calculamos a mano
   anteriormente (Marriott jul-2024: Occ 0.5692 / ADR 159.73 / RevPAR 90.92).

3. **`0003_rls.sql`** — Row Level Security: un usuario de Panatel no puede
   leer filas de Numah **ni siquiera si arma la consulta a mano**, porque
   la restricción está en la base, no en el frontend. **Probado en vivo**:
   con un usuario de prueba por organización, cada uno ve exactamente sus
   hoteles y ninguno más; sin sesión, cero filas.

4. **`0004_ingestion_helpers.sql`** — función que usa el detector de
   anomalías del pipeline de PDFs para decidir si una tarifa reportada es
   plausible (percentiles de los últimos 90 días del propio hotel).

## 2. Cómo levantarlo en Supabase real

1. Crear proyecto en [supabase.com](https://supabase.com) (plan gratuito
   alcanza para arrancar).
2. En el SQL Editor del proyecto, correr los 4 archivos de
   `supabase/migrations/` **en orden**.
3. Crear el bucket de Storage `pdf-ingestions` (para los PDFs originales).
4. Copiar `.env.local.example` a `.env.local` y completar con las
   credenciales del proyecto (Project Settings → API).
5. `npm install` (ya agregado `@supabase/ssr` y `@supabase/supabase-js`
   a `package.json`).
6. Crear los primeros usuarios: por ahora a mano desde el dashboard de
   Supabase (Authentication → Users → Invite), y después insertar la fila
   correspondiente en `profiles` con el `role` y `organization_id` que
   corresponda. Más adelante esto se puede envolver en una pantalla de
   "alta de usuario" para no hacerlo a mano cada vez.

## 3. Pipeline de PDFs — estado del parser

`lib/ingestion/pdf_pipeline.py` tiene el flujo completo (Gmail → staging en
Storage → parseo → detector de anomalías → carga a `daily_metrics`).

**`parse_pdf()` ya está implementado y validado** contra los 10 PDFs reales
de **R106 History and Forecast** (el reporte que hoy se pasa a mano al
Excel) que mandaste: Marriott Buenos Aires, Sheraton Mar del Plata y
Sheraton Bariloche, varios meses, con y sin sección "History". Cómo
funciona, en criollo:

- El texto de un PDF no viene ordenado fila por fila, así que el parser usa
  la posición (x, y) de cada palabra para reconstruir la tabla, anclándose
  en la fila de "Total" del pie de página (siempre tiene un valor en cada
  columna).
- Detecta solo el layout de columnas que ya vio en los PDFs reales (14
  columnas estándar, 16 si el reporte trae Non-Ded. Indiv./Group como el de
  Sheraton MDQ, y las variantes sin "No Show Rooms" que aparecen cuando el
  reporte es 100% a futuro). Si un PDF nuevo trae un layout distinto a
  estos, el parser **no adivina**: tira un error claro para revisarlo a
  mano y sumar el layout nuevo, en vez de cargar datos mal alineados.
- Identifica el hotel por el nombre en el encabezado del PDF. Todavía falta
  sumar el mapeo de Maitei Posadas y City Express Plus (Numah) — en cuanto
  mandes un par de PDFs de esos hoteles los agrego.

Sigue pendiente: `fetch_new_pdfs()` (credenciales OAuth de Gmail API para
bajar los adjuntos automáticamente de agencialtelc@gmail.com) y los otros
dos tipos de reporte que mandaste (F116 Manager - Flash y J146 Elite
Arrivals), que son valiosos pero quedan para una segunda etapa: hoy no
alimentan `daily_metrics`, tienen forma de datos distinta (F116 es una
foto Day/Month/Year con pace real a 7/31/365 días; J146 es un listado de
huéspedes, no una tabla diaria).

## 4. Portal (frontend) — ya conectado a datos reales

Ya existe:
- `middleware.ts` — bloquea cualquier ruta sin sesión, redirige a `/login`.
- `app/login/page.tsx` — pantalla de login funcional.
- `lib/supabase/client.ts` y `lib/supabase/server.ts` — clientes para
  componentes de cliente/servidor respectivamente.
- `app/api/kpis/route.ts` — KPIs mensuales ya calculados (`v_monthly_kpis_calc`).
- **`app/api/daily-metrics.csv/route.ts`** — el cambio clave: reemplaza al
  archivo estático `/data/hf_diario.csv` que leía `app/page.tsx`. Devuelve
  el mismo formato de columnas que el CSV original (para no tocar el diseño
  de ningún componente visual), pero consultando `daily_metrics` en Supabase
  en tiempo real, ya filtrado por RLS según quién esté logueado.
- `app/page.tsx` ya apunta a ese endpoint (`HF_PATH`) en vez del CSV local.

De paso, arreglé algunos bugs de compilación que estaban rotos desde antes
(un JSX mal cerrado en `KpiCarousel.tsx`, imports a un archivo que no
existía en `HofExplorer.tsx`/`MonthRanking.tsx`, un `DashboardClient.tsx`
duplicado y no usado que se borró, y los filtros de Trimestre/Mes de
`StickyFilterBars` que no tenían estado en `page.tsx`) — sin eso `npm run
build` fallaba. Ahora compila y buildea limpio (`npm run build` verificado).

**Cómo probarlo vos:**
1. Copiá `.env.local.example` a `.env.local` y completá con la URL y la
   anon key de tu proyecto Supabase real (Project Settings → API).
2. `npm install && npm run dev`.
3. Entrá a `http://localhost:3000/login` con el usuario de prueba que ya
   creaste, y deberías ver el dashboard con los datos reales cargados.

**Lo que todavía queda en CSV/XLSX estático** (no migrado en esta vuelta):
Membership y Nacionalidades (`MEMBERSHIP_PATH`, `NACIONALIDADES_PATH`) —
esos datos no tienen todavía una tabla poblada en Supabase (`guest_nationality`
existe en el schema pero vacía). Se puede migrar en un paso siguiente.

**Gap conocido**: el bloque "Gotel (Maitei)" de la página se muestra
siempre, incluso para un usuario que no tiene acceso a esos hoteles — RLS
ya le devuelve cero filas (la seguridad de fondo está garantizada), pero
visualmente ve un bloque vacío en vez de que se oculte. Pulido pendiente,
no es un problema de seguridad.

## 5. Base de desarrollo local (ya probada)

Para repetir la validación local (Postgres 16 en este entorno):

```bash
sudo -u postgres psql -c "CREATE DATABASE ltelc_dev;"
for f in supabase/migrations/*.sql; do
  sudo -u postgres psql -d ltelc_dev -f "$f"
done
python3 scripts/seed_dev_db.py   # carga H_F.xlsx real a daily_metrics
```
