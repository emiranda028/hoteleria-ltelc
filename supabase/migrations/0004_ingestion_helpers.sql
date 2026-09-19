-- Percentiles de ADR de los últimos 90 días de un hotel — usado por el
-- detector de anomalías del pipeline de PDFs (lib/ingestion/pdf_pipeline.py)
-- para decidir si una tarifa reportada es plausible antes de aplicarla.

create or replace function adr_percentiles_last_90d(p_hotel_code text)
returns table(p25 numeric, p75 numeric) as $$
  select
    percentile_cont(0.25) within group (order by dm.average_rate_reported)::numeric,
    percentile_cont(0.75) within group (order by dm.average_rate_reported)::numeric
  from daily_metrics dm
  join hotels h on h.id = dm.hotel_id
  where h.code = p_hotel_code
    and dm.hof = 'history'
    and dm.is_excluded = false
    and dm.fecha >= current_date - interval '90 days'
    and dm.average_rate_reported > 0
$$ language sql stable;
