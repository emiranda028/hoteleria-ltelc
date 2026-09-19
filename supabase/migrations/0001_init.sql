-- ============================================================================
-- LTELC · Portal de clientes — schema inicial
-- ============================================================================
-- Diseño multi-tenant: cada hotel pertenece a una organización (Panatel,
-- Numah). Un usuario del cliente solo ve los hoteles de su organización.
-- El equipo de LTELC (role='ltelc_admin') ve todo. Contactos puntuales
-- (ej. Christian, el CFO) se resuelven con un role aparte, sin acceso a
-- datos operativos de los hoteles salvo que se les asigne organización.
--
-- Principio de diseño clave: NUNCA confiamos en "Average Rate" ni "Occ.%"
-- tal como vienen reportados por fila. Se guardan como referencia/auditoría,
-- pero todo cálculo real (ADR, Occ, RevPAR) se hace ponderado por ingresos/
-- habitaciones en las vistas (v_monthly_kpis), replicando la corrección de
-- metodología que ya validamos a mano sobre H_F.xlsx (evita el error del
-- 01-07-2024: tarifa duplicada e inconsistente en Marriott/Maitei).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Organizaciones (clientes) y hoteles
-- ---------------------------------------------------------------------------

create table organizations (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,          -- 'panatel', 'numah', 'ltelc'
  name         text not null,
  is_internal  boolean not null default false, -- true solo para LTELC
  created_at   timestamptz not null default now()
);

create table hotels (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references organizations(id) on delete restrict,
  code             text not null unique,       -- 'MARRIOTT','SHERATON_MDQ','SHERATON_BCR','MAITEI','CITY_EXPRESS_PLUS'
  name             text not null,
  city             text,
  rooms_inventory  integer,                    -- capacidad nominal, si se conoce (referencia; RoomsAvail real se estima por día)
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

create index idx_hotels_org on hotels(organization_id);

-- ---------------------------------------------------------------------------
-- Perfiles de usuario (se enlaza 1:1 con auth.users de Supabase por id)
-- ---------------------------------------------------------------------------

create type user_role as enum ('ltelc_admin', 'client_admin', 'client_viewer', 'external_contact');

create table profiles (
  id               uuid primary key,           -- = auth.users.id en Supabase
  email            text not null,
  full_name        text,
  role             user_role not null default 'client_viewer',
  organization_id  uuid references organizations(id) on delete set null, -- null permitido solo para ltelc_admin
  created_at       timestamptz not null default now(),
  constraint chk_admin_no_org_required check (
    role = 'ltelc_admin' or organization_id is not null
  )
);

create index idx_profiles_org on profiles(organization_id);

-- ---------------------------------------------------------------------------
-- Métricas diarias por hotel — reemplaza la hoja "H&F" del Excel
-- ---------------------------------------------------------------------------

create type hof_status as enum ('history', 'forecast');
create type data_source as enum ('manual_upload', 'pdf_automation', 'seed');

create table daily_metrics (
  id                uuid primary key default gen_random_uuid(),
  hotel_id          uuid not null references hotels(id) on delete restrict,
  fecha             date not null,
  hof               hof_status not null,

  total_occ_rooms   numeric,
  arr_rooms         numeric,
  comp_rooms        numeric,
  house_use_rooms   numeric,
  dep_rooms         numeric,
  day_use_rooms     numeric,
  no_show_rooms     numeric,
  ooo_rooms         numeric,
  adl_chl           numeric,

  room_revenue      numeric,
  average_rate_reported numeric,  -- tal como viene reportado; NO usar para cálculos, solo auditoría
  occ_pct_reported  numeric,      -- ídem

  source            data_source not null default 'manual_upload',
  ingested_by       uuid references profiles(id),
  ingested_at       timestamptz not null default now(),

  is_excluded       boolean not null default false, -- true para filas marcadas como error confirmado (ver data_quality_flags)

  unique (hotel_id, fecha, hof)
);

create index idx_daily_metrics_hotel_fecha on daily_metrics(hotel_id, fecha);
create index idx_daily_metrics_hof on daily_metrics(hof);

-- ---------------------------------------------------------------------------
-- Flags de calidad de datos — el detector automático de anomalías
-- ---------------------------------------------------------------------------

create type quality_flag_type as enum (
  'adr_outlier', 'negative_revenue', 'occ_out_of_range', 'duplicate_value_across_hotels', 'other'
);

create table data_quality_flags (
  id               uuid primary key default gen_random_uuid(),
  daily_metric_id  uuid not null references daily_metrics(id) on delete cascade,
  flag_type        quality_flag_type not null,
  detail           text,
  detected_at      timestamptz not null default now(),
  resolved         boolean not null default false,
  resolved_by      uuid references profiles(id),
  resolved_at      timestamptz
);

create index idx_quality_flags_metric on data_quality_flags(daily_metric_id);
create index idx_quality_flags_unresolved on data_quality_flags(resolved) where resolved = false;

-- ---------------------------------------------------------------------------
-- Pipeline de ingesta de PDFs — reemplaza el paso manual (Gmail -> Excel)
-- ---------------------------------------------------------------------------

create type ingestion_status as enum ('received', 'parsing', 'parsed', 'needs_review', 'applied', 'failed');

create table pdf_ingestions (
  id               uuid primary key default gen_random_uuid(),
  hotel_id         uuid references hotels(id),         -- puede ser null hasta que el parser lo identifique
  gmail_message_id text unique,
  received_at      timestamptz not null default now(),
  storage_path     text not null,                        -- ubicación del PDF original (Supabase Storage)
  status           ingestion_status not null default 'received',
  parsed_payload   jsonb,                                 -- lo que el parser extrajo, antes de aplicar a daily_metrics
  error_message    text,
  applied_at       timestamptz,
  applied_metric_id uuid references daily_metrics(id)
);

create index idx_pdf_ingestions_status on pdf_ingestions(status);
create index idx_pdf_ingestions_hotel on pdf_ingestions(hotel_id);

-- ---------------------------------------------------------------------------
-- Nacionalidad de huéspedes — hoy solo Marriott, extensible por hotel/año
-- ---------------------------------------------------------------------------

create table guest_nationality (
  id          uuid primary key default gen_random_uuid(),
  hotel_id    uuid not null references hotels(id) on delete restrict,
  anio        integer not null,
  pais        text not null,
  continente  text,
  huespedes   integer not null,
  source      data_source not null default 'manual_upload',
  created_at  timestamptz not null default now(),
  unique (hotel_id, anio, pais)
);

create index idx_guest_nat_hotel on guest_nationality(hotel_id);

-- ---------------------------------------------------------------------------
-- Snapshots de forecast — para poder medir precisión de pronóstico a futuro
-- (hoy no existe este dato porque nunca se guardó el pace histórico; a
-- partir de que esta tabla exista, cada carga diaria deja un registro y en
-- unos meses vamos a poder decir "nuestro forecast a 60 días erra un X%" —
-- algo que ningún proceso ad-hoc con PDFs sueltos puede construir sin
-- snapshots acumulados en el tiempo)
-- ---------------------------------------------------------------------------

create table forecast_snapshots (
  id            uuid primary key default gen_random_uuid(),
  hotel_id      uuid not null references hotels(id) on delete restrict,
  snapshot_date date not null,        -- fecha en que se tomó la foto (hoy)
  target_month  text not null,        -- 'YYYY-MM' del mes pronosticado
  occ_pct       numeric,
  adr           numeric,
  room_revenue  numeric,
  rooms_avail   numeric,
  captured_at   timestamptz not null default now(),
  unique (hotel_id, snapshot_date, target_month)
);

create index idx_forecast_snapshots_hotel_month on forecast_snapshots(hotel_id, target_month);
