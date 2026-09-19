-- ============================================================================
-- Row Level Security — aislamiento multi-tenant
-- ============================================================================
-- Un usuario de Panatel jamás debe poder leer filas de Numah, ni al revés.
-- Esto se aplica a nivel de base de datos (no solo en el frontend), así
-- que aunque alguien inspeccione la red o llame la API directo, Postgres
-- mismo bloquea la fila. role='ltelc_admin' ve todo.
--
-- Nota: helper current_user_role()/current_user_org() asumen que el
-- backend setea auth.uid() (estándar de Supabase Auth) y que existe una
-- fila en profiles con ese id.
-- ============================================================================

create or replace function current_profile()
returns profiles as $$
  select * from profiles where id = auth.uid();
$$ language sql stable security definer;

create or replace function is_ltelc_admin()
returns boolean as $$
  select coalesce((select role = 'ltelc_admin' from profiles where id = auth.uid()), false);
$$ language sql stable security definer;

create or replace function my_organization_id()
returns uuid as $$
  select organization_id from profiles where id = auth.uid();
$$ language sql stable security definer;

alter table organizations enable row level security;
alter table hotels enable row level security;
alter table profiles enable row level security;
alter table daily_metrics enable row level security;
alter table data_quality_flags enable row level security;
alter table pdf_ingestions enable row level security;
alter table guest_nationality enable row level security;
alter table forecast_snapshots enable row level security;

-- organizations: cada uno ve la suya; admin ve todas
create policy org_select on organizations for select
  using (is_ltelc_admin() or id = my_organization_id());

-- hotels: idem, vía organization_id
create policy hotels_select on hotels for select
  using (is_ltelc_admin() or organization_id = my_organization_id());

-- profiles: cada usuario ve su propio perfil; admin ve todos
create policy profiles_select on profiles for select
  using (is_ltelc_admin() or id = auth.uid());

create policy profiles_update_self on profiles for update
  using (id = auth.uid());

-- daily_metrics: acceso vía el hotel al que pertenece la fila
create policy daily_metrics_select on daily_metrics for select
  using (
    is_ltelc_admin()
    or hotel_id in (select id from hotels where organization_id = my_organization_id())
  );

-- solo ltelc_admin o client_admin pueden insertar/editar métricas (carga manual)
create policy daily_metrics_write on daily_metrics for insert
  with check (
    is_ltelc_admin()
    or (
      hotel_id in (select id from hotels where organization_id = my_organization_id())
      and (select role from profiles where id = auth.uid()) = 'client_admin'
    )
  );

-- data_quality_flags: visibles a quien puede ver la métrica asociada
create policy quality_flags_select on data_quality_flags for select
  using (
    is_ltelc_admin()
    or daily_metric_id in (
      select dm.id from daily_metrics dm
      join hotels h on h.id = dm.hotel_id
      where h.organization_id = my_organization_id()
    )
  );

-- pdf_ingestions: solo LTELC admin gestiona el pipeline de ingesta
create policy pdf_ingestions_admin_only on pdf_ingestions for all
  using (is_ltelc_admin())
  with check (is_ltelc_admin());

-- guest_nationality: mismo criterio que daily_metrics
create policy guest_nationality_select on guest_nationality for select
  using (
    is_ltelc_admin()
    or hotel_id in (select id from hotels where organization_id = my_organization_id())
  );

-- forecast_snapshots: mismo criterio
create policy forecast_snapshots_select on forecast_snapshots for select
  using (
    is_ltelc_admin()
    or hotel_id in (select id from hotels where organization_id = my_organization_id())
  );
