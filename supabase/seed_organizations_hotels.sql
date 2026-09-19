-- Correr UNA VEZ en el SQL Editor de Supabase, después de las 4 migraciones.
-- Crea las organizaciones, los 5 hoteles, y te da rol de administrador LTELC.

insert into organizations (slug, name, is_internal) values
  ('panatel', 'Panatel', false),
  ('numah', 'Numah', false),
  ('ltelc', 'LTELC (interno)', true)
on conflict (slug) do nothing;

insert into hotels (organization_id, code, name)
select o.id, h.code, h.name
from (values
  ('MARRIOTT', 'Marriott Buenos Aires', 'panatel'),
  ('SHERATON_MDQ', 'Sheraton Mar del Plata', 'panatel'),
  ('SHERATON_BCR', 'Sheraton Bariloche', 'panatel'),
  ('CITY_EXPRESS_PLUS', 'City Express Plus', 'numah'),
  ('MAITEI', 'Maitei Posadas', 'numah')
) as h(code, name, org_slug)
join organizations o on o.slug = h.org_slug
on conflict (code) do nothing;

-- Tu usuario como administrador LTELC (ve todos los hoteles, sin restricción)
insert into profiles (id, email, full_name, role, organization_id)
values (
  '3978d9e2-e39b-406b-b2cc-3a638250b528',
  'TU_EMAIL_AQUI',
  'Emma',
  'ltelc_admin',
  null
)
on conflict (id) do update set role = excluded.role;
