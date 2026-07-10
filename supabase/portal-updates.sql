-- PROGRAMA DE LIDERAZGO ES POSIBLE EP
-- Cambios requeridos para guardar el record semanal de indicadores.
-- Ejecutar en Supabase SQL editor antes de publicar esta version.

create table if not exists public.metric_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week text not null,
  identidad integer not null default 0 check (identidad between 0 and 100),
  emociones integer not null default 0 check (emociones between 0 and 100),
  retos integer not null default 0 check (retos between 0 and 100),
  servicio integer not null default 0 check (servicio between 0 and 100),
  overall integer not null default 0 check (overall between 0 and 100),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, week)
);

alter table public.metric_records enable row level security;

drop policy if exists "Participants can manage own metric records" on public.metric_records;
drop policy if exists "Participants can read own metric records" on public.metric_records;
create policy "Participants can read own metric records"
on public.metric_records
for select
using (auth.uid() = user_id);

drop policy if exists "Participants can create own metric records" on public.metric_records;
create policy "Participants can create own metric records"
on public.metric_records
for insert
with check (auth.uid() = user_id);

drop policy if exists "Staff can read assigned participant metric records" on public.metric_records;
create policy "Staff can read assigned participant metric records"
on public.metric_records
for select
using (
  exists (
    select 1
    from public.profiles staff_profile
    join public.profiles participant_profile
      on participant_profile.staff_id = staff_profile.id
    where staff_profile.id = auth.uid()
      and staff_profile.role in ('staff', 'admin')
      and participant_profile.id = metric_records.user_id
  )
);

drop policy if exists "Admins can read all metric records" on public.metric_records;
create policy "Admins can read all metric records"
on public.metric_records
for select
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

-- Historial de carta de logros: cada guardado conserva una version fechada.
create table if not exists public.letter_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists letter_versions_user_created_idx
on public.letter_versions (user_id, created_at desc);

alter table public.letter_versions enable row level security;

drop policy if exists "Participants can manage own letter versions" on public.letter_versions;
create policy "Participants can manage own letter versions"
on public.letter_versions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Staff can read assigned participant letter versions" on public.letter_versions;
create policy "Staff can read assigned participant letter versions"
on public.letter_versions
for select
using (
  exists (
    select 1
    from public.profiles staff_profile
    join public.profiles participant_profile
      on participant_profile.staff_id = staff_profile.id
    where staff_profile.id = auth.uid()
      and staff_profile.role in ('staff', 'admin')
      and participant_profile.id = letter_versions.user_id
  )
);

drop policy if exists "Admins can read all letter versions" on public.letter_versions;
create policy "Admins can read all letter versions"
on public.letter_versions
for select
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

-- Registro de consentimiento informado y tratamiento de datos.
create table if not exists public.consent_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  consent_version text not null,
  consent_pdf_path text not null,
  accepted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, consent_version)
);

alter table public.consent_acceptances enable row level security;

drop policy if exists "Participants can create own consent acceptance" on public.consent_acceptances;
create policy "Participants can create own consent acceptance"
on public.consent_acceptances
for insert
with check (auth.uid() = user_id);

drop policy if exists "Participants can read own consent acceptance" on public.consent_acceptances;
create policy "Participants can read own consent acceptance"
on public.consent_acceptances
for select
using (auth.uid() = user_id);

drop policy if exists "Staff can read assigned participant consent acceptance" on public.consent_acceptances;
create policy "Staff can read assigned participant consent acceptance"
on public.consent_acceptances
for select
using (
  exists (
    select 1
    from public.profiles staff_profile
    join public.profiles participant_profile
      on participant_profile.staff_id = staff_profile.id
    where staff_profile.id = auth.uid()
      and staff_profile.role in ('staff', 'admin')
      and participant_profile.id = consent_acceptances.user_id
  )
);

drop policy if exists "Admins can read all consent acceptances" on public.consent_acceptances;
create policy "Admins can read all consent acceptances"
on public.consent_acceptances
for select
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

create or replace function public.record_consent_acceptance(
  p_user_id uuid,
  p_consent_version text,
  p_consent_pdf_path text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    return jsonb_build_object('success', false, 'message', 'Usuario no autorizado.');
  end if;

  insert into public.consent_acceptances (
    user_id,
    consent_version,
    consent_pdf_path,
    accepted_at,
    metadata
  )
  values (
    p_user_id,
    p_consent_version,
    p_consent_pdf_path,
    now(),
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (user_id, consent_version)
  do update set
    accepted_at = excluded.accepted_at,
    consent_pdf_path = excluded.consent_pdf_path,
    metadata = excluded.metadata;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.record_consent_acceptance(uuid, text, text, jsonb) to authenticated;

-- Progreso de niveles calculado por el servidor.
-- El front usa esta funcion para evitar que el participante marque niveles manualmente
-- o que la fecha del navegador cambie el avance.
create or replace function public.get_level_progress()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with levels as (
    select *
    from (
      values
        ('nivel1', 'Nivel 1 Valioso', '2026-07-06 00:00:00-05'::timestamptz, 4),
        ('nivel2', 'Nivel 2 Valiente I', '2026-08-10 00:00:00-05'::timestamptz, 8),
        ('nivel3', 'Nivel 3 Valiente II', '2026-08-31 00:00:00-05'::timestamptz, 12),
        ('nivel4', 'Nivel 4 Poderoso', '2026-09-14 00:00:00-05'::timestamptz, 16),
        ('confianza', 'Noche de confianza', '2026-09-25 00:00:00-05'::timestamptz, 20),
        ('nivel5', 'Nivel 5 Supervivencia', '2026-10-19 00:00:00-05'::timestamptz, 24)
    ) as level_data(key, name, unlock_at, progress_percent)
  ),
  completed as (
    select key, progress_percent
    from levels
    where now() >= unlock_at
    order by unlock_at
  ),
  next_level as (
    select key
    from levels
    where now() < unlock_at
    order by unlock_at
    limit 1
  )
  select jsonb_build_object(
    'server_now', now(),
    'completed_keys', coalesce((select jsonb_agg(key) from completed), '[]'::jsonb),
    'current_percent', coalesce((select max(progress_percent) from completed), 0),
    'next_key', (select key from next_level)
  );
$$;

grant execute on function public.get_level_progress() to authenticated;

-- Pre-registro y activación de staff creado por admin.
create table if not exists public.pending_staff (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name text,
  whatsapp text,
  email text not null,
  activation_code text not null unique,
  role text not null default 'staff' check (role in ('staff', 'admin')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.pending_staff enable row level security;

drop policy if exists "Admins can read pending staff" on public.pending_staff;
create policy "Admins can read pending staff"
on public.pending_staff
for select
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

drop policy if exists "Admins can create pending staff" on public.pending_staff;
create policy "Admins can create pending staff"
on public.pending_staff
for insert
with check (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

create or replace function public.preregister_staff(
  p_first_name text,
  p_last_name text,
  p_whatsapp text,
  p_email text,
  p_code text,
  p_role text default 'staff'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_role text := lower(coalesce(p_role, 'staff'));
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  ) then
    return jsonb_build_object('success', false, 'message', 'Solo admin puede crear staff.');
  end if;

  if clean_role not in ('staff', 'admin') then
    clean_role := 'staff';
  end if;

  insert into public.pending_staff (
    first_name,
    last_name,
    whatsapp,
    email,
    activation_code,
    role,
    created_by
  )
  values (
    trim(p_first_name),
    trim(p_last_name),
    p_whatsapp,
    lower(trim(p_email)),
    upper(trim(p_code)),
    clean_role,
    auth.uid()
  )
  on conflict (activation_code)
  do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    whatsapp = excluded.whatsapp,
    email = excluded.email,
    role = excluded.role,
    created_by = excluded.created_by;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.preregister_staff(text, text, text, text, text, text) to authenticated;

-- Activación segura de participantes.
-- Fuerza role = 'participant' para evitar que un registro por código herede rol staff/admin.
create or replace function public.activate_participant(
  p_code text,
  p_auth_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_record public.pending_participants%rowtype;
begin
  select *
  into pending_record
  from public.pending_participants
  where upper(activation_code) = upper(p_code)
  limit 1;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Código no válido.');
  end if;

  insert into public.profiles (
    id,
    first_name,
    last_name,
    email,
    whatsapp,
    role,
    staff_id,
    emergency_first_name,
    emergency_last_name,
    emergency_phone,
    created_at
  )
  values (
    p_auth_id,
    pending_record.first_name,
    pending_record.last_name,
    pending_record.email,
    pending_record.whatsapp,
    'participant',
    pending_record.staff_id,
    pending_record.emergency_first_name,
    pending_record.emergency_last_name,
    pending_record.emergency_phone,
    now()
  )
  on conflict (id)
  do update set
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    email = excluded.email,
    whatsapp = excluded.whatsapp,
    role = 'participant',
    staff_id = excluded.staff_id,
    emergency_first_name = excluded.emergency_first_name,
    emergency_last_name = excluded.emergency_last_name,
    emergency_phone = excluded.emergency_phone;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.activate_participant(text, uuid) to authenticated;

-- Activación general por código: participante o staff.
create or replace function public.activate_portal_account(
  p_code text,
  p_auth_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_record public.pending_staff%rowtype;
  participant_result jsonb;
begin
  select *
  into staff_record
  from public.pending_staff
  where upper(activation_code) = upper(p_code)
  limit 1;

  if found then
    insert into public.profiles (
      id,
      first_name,
      last_name,
      email,
      whatsapp,
      role,
      created_at
    )
    values (
      p_auth_id,
      staff_record.first_name,
      staff_record.last_name,
      staff_record.email,
      staff_record.whatsapp,
      staff_record.role,
      now()
    )
    on conflict (id)
    do update set
      first_name = excluded.first_name,
      last_name = excluded.last_name,
      email = excluded.email,
      whatsapp = excluded.whatsapp,
      role = excluded.role;

    return jsonb_build_object('success', true, 'role', staff_record.role);
  end if;

  participant_result := public.activate_participant(p_code, p_auth_id);
  if coalesce((participant_result->>'success')::boolean, false) then
    return participant_result || jsonb_build_object('role', 'participant');
  end if;

  return jsonb_build_object('success', false, 'message', 'Código no válido.');
end;
$$;

grant execute on function public.activate_portal_account(text, uuid) to authenticated;

-- Corrección del usuario de prueba creado durante QA local.
update public.profiles
set role = 'participant'
where lower(email) = 'participante.test2@javipenaloza.com';

-- Asignación de participantes a mini equipos.
create or replace function public.assign_participant_to_staff(
  p_participant_id uuid,
  p_staff_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  ) then
    return jsonb_build_object('success', false, 'message', 'Solo admin puede asignar mini equipos.');
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = p_staff_id
      and role in ('staff', 'admin')
  ) then
    return jsonb_build_object('success', false, 'message', 'Staff no válido.');
  end if;

  update public.profiles
  set staff_id = p_staff_id
  where id = p_participant_id
    and role = 'participant';

  if not found then
    return jsonb_build_object('success', false, 'message', 'Participante no encontrado.');
  end if;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.assign_participant_to_staff(uuid, uuid) to authenticated;

-- Las guías creadas por staff/admin deben ser visibles para participantes.
alter table public.resources add column if not exists file_path text;
alter table public.resources add column if not exists file_name text;
alter table public.resources add column if not exists target_participant_id uuid references public.profiles(id) on delete set null;
alter table public.resources add column if not exists audience text not null default 'participants'
  check (audience in ('participants', 'staff'));

alter table public.resources enable row level security;

drop policy if exists "Authenticated users can read resources" on public.resources;
create policy "Participants can read assigned or general resources"
on public.resources
for select
using (
  auth.uid() is not null
  and (
    exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('staff', 'admin')
    )
    or (
      audience = 'participants'
      and (
        target_participant_id is null
        or target_participant_id = auth.uid()
      )
    )
  )
);

drop policy if exists "Staff and admins can insert resources" on public.resources;
create policy "Staff and admins can insert resources"
on public.resources
for insert
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('staff', 'admin')
  )
);

create table if not exists public.mini_team_checks (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.profiles(id) on delete cascade,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  check_key text not null check (check_key in ('indicadores', 'carta', 'reflexion', 'actividades', 'tickets')),
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_id, participant_id, check_key)
);

alter table public.mini_team_checks enable row level security;

drop policy if exists "Staff can manage own mini team checks" on public.mini_team_checks;
create policy "Staff can manage own mini team checks"
on public.mini_team_checks
for all
using (
  staff_id = auth.uid()
  and exists (
    select 1
    from public.profiles staff_profile
    where staff_profile.id = auth.uid()
      and staff_profile.role in ('staff', 'admin')
  )
)
with check (
  staff_id = auth.uid()
  and exists (
    select 1
    from public.profiles staff_profile
    join public.profiles participant_profile
      on participant_profile.id = mini_team_checks.participant_id
    where staff_profile.id = auth.uid()
      and staff_profile.role in ('staff', 'admin')
      and (
        staff_profile.role = 'admin'
        or participant_profile.staff_id = staff_profile.id
      )
  )
);

drop policy if exists "Admins can read all mini team checks" on public.mini_team_checks;
create policy "Admins can read all mini team checks"
on public.mini_team_checks
for select
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

drop policy if exists "Staff and admins can update own resources" on public.resources;
create policy "Staff and admins can update own resources"
on public.resources
for update
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
)
with check (
  created_by = auth.uid()
  or exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

insert into storage.buckets (id, name, public)
values ('resource-files', 'resource-files', true)
on conflict (id) do nothing;

drop policy if exists "Authenticated users can read resource files" on storage.objects;
create policy "Authenticated users can read resource files"
on storage.objects
for select
using (
  bucket_id = 'resource-files'
  and auth.uid() is not null
);

drop policy if exists "Staff and admins can upload resource files" on storage.objects;
create policy "Staff and admins can upload resource files"
on storage.objects
for insert
with check (
  bucket_id = 'resource-files'
  and exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('staff', 'admin')
  )
);

-- Agenda y registros de acompañamiento del participante.
create table if not exists public.support_slots (
  id uuid primary key default gen_random_uuid(),
  support_type text not null check (support_type in ('coaching', 'psicologico')),
  slot_date date not null,
  start_time time not null,
  end_time time not null,
  capacity integer not null default 1 check (capacity > 0),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.support_slots enable row level security;

drop policy if exists "Authenticated users can read active support slots" on public.support_slots;
create policy "Authenticated users can read active support slots"
on public.support_slots
for select
using (
  auth.uid() is not null
  and (
    is_active = true
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and role in ('staff', 'admin')
    )
  )
);

drop policy if exists "Staff and admins can manage support slots" on public.support_slots;
create policy "Staff and admins can manage support slots"
on public.support_slots
for all
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('staff', 'admin')
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role in ('staff', 'admin')
  )
);

create table if not exists public.support_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  support_type text not null check (support_type in ('coaching', 'psicologico', 'buddy')),
  support_slot_id uuid references public.support_slots(id) on delete set null,
  support_date date not null,
  support_time time,
  topic text not null,
  notes text not null,
  created_at timestamptz not null default now()
);

alter table public.support_records add column if not exists support_slot_id uuid references public.support_slots(id) on delete set null;
alter table public.support_records add column if not exists support_time time;

alter table public.support_records enable row level security;

drop policy if exists "Participants can manage own support records" on public.support_records;
create policy "Participants can manage own support records"
on public.support_records
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Staff can read assigned participant support records" on public.support_records;
create policy "Staff can read assigned participant support records"
on public.support_records
for select
using (
  exists (
    select 1
    from public.profiles staff_profile
    join public.profiles participant_profile
      on participant_profile.staff_id = staff_profile.id
    where staff_profile.id = auth.uid()
      and staff_profile.role in ('staff', 'admin')
      and participant_profile.id = support_records.user_id
  )
);

drop policy if exists "Admins can read all support records" on public.support_records;
create policy "Admins can read all support records"
on public.support_records
for select
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);

create or replace function public.book_support_slot(
  p_slot_id uuid,
  p_topic text,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  slot_record public.support_slots%rowtype;
  booked_count integer;
begin
  select *
  into slot_record
  from public.support_slots
  where id = p_slot_id
    and is_active = true
    and slot_date >= current_date
  for update;

  if not found then
    return jsonb_build_object('success', false, 'message', 'Horario no disponible.');
  end if;

  select count(*)
  into booked_count
  from public.support_records
  where support_slot_id = p_slot_id;

  if booked_count >= slot_record.capacity then
    return jsonb_build_object('success', false, 'message', 'Horario sin cupos.');
  end if;

  insert into public.support_records (
    user_id,
    support_type,
    support_slot_id,
    support_date,
    support_time,
    topic,
    notes
  )
  values (
    auth.uid(),
    slot_record.support_type,
    slot_record.id,
    slot_record.slot_date,
    slot_record.start_time,
    p_topic,
    p_notes
  );

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.book_support_slot(uuid, text, text) to authenticated;

-- Registros de herramientas trabajadas en la seccion Recursos.
create table if not exists public.resource_tool_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  resource_type text not null check (resource_type in ('diagnostico', 'feedback', 'practica', 'impacto')),
  title text not null,
  score text not null,
  notes text not null,
  created_at timestamptz not null default now()
);

alter table public.resource_tool_records enable row level security;

drop policy if exists "Participants can manage own resource tool records" on public.resource_tool_records;
create policy "Participants can manage own resource tool records"
on public.resource_tool_records
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Staff can read assigned participant resource tool records" on public.resource_tool_records;
create policy "Staff can read assigned participant resource tool records"
on public.resource_tool_records
for select
using (
  exists (
    select 1
    from public.profiles staff_profile
    join public.profiles participant_profile
      on participant_profile.staff_id = staff_profile.id
    where staff_profile.id = auth.uid()
      and staff_profile.role in ('staff', 'admin')
      and participant_profile.id = resource_tool_records.user_id
  )
);

drop policy if exists "Admins can read all resource tool records" on public.resource_tool_records;
create policy "Admins can read all resource tool records"
on public.resource_tool_records
for select
using (
  exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  )
);
