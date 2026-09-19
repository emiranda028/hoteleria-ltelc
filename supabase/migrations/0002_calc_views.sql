-- ============================================================================
-- Vistas de cálculo — el motor de cálculo correcto, en un solo lugar
-- ============================================================================
-- Reemplazan las fórmulas sueltas en celdas de Excel. Toda vista pondera
-- por ingresos/habitaciones reales, nunca promedia tarifas diarias (ese
-- era el bug: un solo día con una tarifa mal tipeada distorsionaba el
-- promedio de todo el mes). Filas marcadas is_excluded=true quedan afuera
-- automáticamente de todos los cálculos.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- KPIs mensuales por hotel (Occ, ADR, RevPAR ponderados)
-- ---------------------------------------------------------------------------

create or replace view v_monthly_kpis as
select
  dm.hotel_id,
  h.organization_id,
  to_char(dm.fecha, 'YYYY-MM') as mes,
  dm.hof,
  sum(dm.room_revenue)                                    as room_revenue,
  sum(dm.total_occ_rooms)                                 as occupied_rooms,
  -- estimación de inventario disponible por día: cuando occ_pct_reported > 0
  -- se puede derivar (occ_rooms / occ_pct); si no, se usa la mediana del
  -- hotel como fallback (mismo criterio que usamos a mano sobre H_F.xlsx)
  sum(
    coalesce(
      case when dm.occ_pct_reported > 0
           then dm.total_occ_rooms / dm.occ_pct_reported
      end,
      (select percentile_cont(0.5) within group (order by
            dm2.total_occ_rooms / nullif(dm2.occ_pct_reported,0))
       from daily_metrics dm2
       where dm2.hotel_id = dm.hotel_id and dm2.occ_pct_reported > 0 and dm2.is_excluded = false)
    )::numeric
  ) as rooms_avail_est,
  count(*) as dias
from daily_metrics dm
join hotels h on h.id = dm.hotel_id
where dm.is_excluded = false
group by dm.hotel_id, h.organization_id, to_char(dm.fecha, 'YYYY-MM'), dm.hof;

-- Occ / ADR / RevPAR derivados (separado para que la ponderación de
-- rooms_avail_est de arriba no se recalcule por columna)
create or replace view v_monthly_kpis_calc as
select
  *,
  round((occupied_rooms / nullif(rooms_avail_est,0))::numeric, 4)  as occ_pct,
  round((room_revenue / nullif(occupied_rooms,0))::numeric, 2)     as adr,
  round((room_revenue / nullif(rooms_avail_est,0))::numeric, 2)    as revpar
from v_monthly_kpis;

comment on view v_monthly_kpis_calc is
  'KPIs mensuales ponderados por ingresos/habitaciones reales. Fuente única de verdad para Occ/ADR/RevPAR — no usar average_rate_reported ni occ_pct_reported directamente en el frontend.';

-- ---------------------------------------------------------------------------
-- Índices de gestión hotelera (no-show, dilución, OOO, prima fin de semana,
-- compresión, estacionalidad) — misma metodología validada sobre H_F.xlsx
-- ---------------------------------------------------------------------------

create or replace view v_management_indices as
with base as (
  select
    dm.hotel_id,
    dm.fecha,
    extract(dow from dm.fecha) as dow,  -- 0=domingo ... 6=sábado
    dm.total_occ_rooms, dm.arr_rooms, dm.no_show_rooms,
    dm.comp_rooms, dm.house_use_rooms, dm.ooo_rooms,
    dm.room_revenue, dm.occ_pct_reported,
    coalesce(
      case when dm.occ_pct_reported > 0 then dm.total_occ_rooms / dm.occ_pct_reported end,
      (select percentile_cont(0.5) within group (order by dm2.total_occ_rooms / nullif(dm2.occ_pct_reported,0))
       from daily_metrics dm2 where dm2.hotel_id = dm.hotel_id and dm2.occ_pct_reported > 0 and dm2.is_excluded = false)
    )::numeric as rooms_avail_est
  from daily_metrics dm
  where dm.hof = 'history' and dm.is_excluded = false
)
select
  hotel_id,
  round(100.0 * sum(no_show_rooms) / nullif(sum(arr_rooms) + sum(no_show_rooms), 0), 1) as noshow_rate_pct,
  round(100.0 * sum(comp_rooms + house_use_rooms) / nullif(sum(total_occ_rooms), 0), 1) as dilution_pct,
  round(100.0 * sum(ooo_rooms) / nullif(sum(rooms_avail_est), 0), 1) as ooo_rate_pct,
  round(
    100.0 * (
      (sum(room_revenue) filter (where dow in (5,6)) / nullif(sum(total_occ_rooms) filter (where dow in (5,6)), 0))
      / nullif(sum(room_revenue) filter (where dow not in (5,6)) / nullif(sum(total_occ_rooms) filter (where dow not in (5,6)), 0), 0)
      - 1
    ), 1
  ) as weekend_premium_pct,
  count(*) filter (where occ_pct_reported >= 0.90) as compression_days,
  count(*) as total_days,
  round(100.0 * count(*) filter (where occ_pct_reported >= 0.90) / nullif(count(*), 0), 1) as compression_pct
from base
group by hotel_id;

comment on view v_management_indices is
  'Índices de gestión (no-show, dilución comp/house-use, OOO, prima fin de semana, compresión). Recalculado siempre sobre daily_metrics — nunca hardcodeado.';
