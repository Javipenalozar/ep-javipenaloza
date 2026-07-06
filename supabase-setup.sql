-- =============================================
-- EP Portal — Supabase Schema Setup
-- Ejecutar en SQL Editor de Supabase
-- =============================================

-- 0. LIMPIAR TABLAS EXISTENTES
-- -----------------------------------------
drop table if exists public.tickets cascade;
drop table if exists public.program_config cascade;
drop table if exists public.resources cascade;
drop table if exists public.level_checks cascade;
drop table if exists public.letters cascade;
drop table if exists public.reflections cascade;
drop table if exists public.evidence cascade;
drop table if exists public.metrics cascade;
drop table if exists public.profiles cascade;

-- 1. TABLAS
-- -----------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'participant' check (role in ('admin','staff','participant')),
  first_name text,
  last_name text,
  whatsapp text,
  staff_id uuid references public.profiles(id),
  cohort text,
  activation_code text unique,
  emergency_first_name text,
  emergency_last_name text,
  emergency_phone text,
  created_at timestamptz default now()
);

create table public.metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  metric_key text not null,
  value integer not null default 0,
  updated_at timestamptz default now(),
  unique(user_id, metric_key)
);

create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  week text not null,
  weekly_win text,
  weekly_learning text,
  weekly_challenge text,
  updated_at timestamptz default now(),
  unique(user_id, week)
);

create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  level_key text not null,
  takeaway text,
  key_moment text,
  decision text,
  staff_evidence text,
  approval_status text default 'pendiente' check (approval_status in ('pendiente','aprobada')),
  approved_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  unique(user_id, level_key)
);

create table public.letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade unique,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);

create table public.level_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  level_key text not null,
  completed boolean default false,
  unique(user_id, level_key)
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  level_key text not null,
  title text not null,
  link text,
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  from_level text not null,
  to_level text not null,
  participant_id uuid not null references public.profiles(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  photo_url text,
  status text default 'pendiente' check (status in ('pendiente','completado','aprobado')),
  completed_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz default now()
);

create table public.program_config (
  key text primary key,
  value jsonb not null
);

insert into public.program_config (key, value) values ('tickets_per_transition', '2');

-- 2. RLS POLICIES
-- -----------------------------------------

alter table public.profiles enable row level security;
alter table public.metrics enable row level security;
alter table public.evidence enable row level security;
alter table public.reflections enable row level security;
alter table public.letters enable row level security;
alter table public.level_checks enable row level security;
alter table public.resources enable row level security;
alter table public.tickets enable row level security;
alter table public.program_config enable row level security;

-- PROFILES
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_select_team" on public.profiles for select using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'staff')
  and staff_id = auth.uid()
);
create policy "profiles_admin_all" on public.profiles for all using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);
create policy "profiles_staff_insert" on public.profiles for insert with check (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff','admin'))
);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- METRICS
create policy "metrics_own" on public.metrics for all using (user_id = auth.uid());
create policy "metrics_staff_read" on public.metrics for select using (
  exists(select 1 from public.profiles p where p.id = user_id and p.staff_id = auth.uid())
);
create policy "metrics_admin" on public.metrics for select using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- EVIDENCE
create policy "evidence_own" on public.evidence for all using (user_id = auth.uid());
create policy "evidence_staff_read" on public.evidence for select using (
  exists(select 1 from public.profiles p where p.id = user_id and p.staff_id = auth.uid())
);
create policy "evidence_admin" on public.evidence for select using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- REFLECTIONS
create policy "reflections_own" on public.reflections for all using (user_id = auth.uid());
create policy "reflections_staff_read" on public.reflections for select using (
  exists(select 1 from public.profiles p where p.id = user_id and p.staff_id = auth.uid())
);
create policy "reflections_staff_approve" on public.reflections for update using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff','admin'))
);
create policy "reflections_admin" on public.reflections for select using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- LETTERS
create policy "letters_own" on public.letters for all using (user_id = auth.uid());
create policy "letters_staff_read" on public.letters for select using (
  exists(select 1 from public.profiles p where p.id = user_id and p.staff_id = auth.uid())
);
create policy "letters_admin" on public.letters for select using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- LEVEL_CHECKS
create policy "checks_own" on public.level_checks for all using (user_id = auth.uid());
create policy "checks_staff_read" on public.level_checks for select using (
  exists(select 1 from public.profiles p where p.id = user_id and p.staff_id = auth.uid())
);
create policy "checks_admin" on public.level_checks for select using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- RESOURCES
create policy "resources_read_all" on public.resources for select using (auth.uid() is not null);
create policy "resources_staff_insert" on public.resources for insert with check (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff','admin'))
);
create policy "resources_admin_manage" on public.resources for all using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- TICKETS
create policy "tickets_participant_select" on public.tickets for select using (participant_id = auth.uid());
create policy "tickets_participant_update" on public.tickets for update using (
  participant_id = auth.uid() and status = 'pendiente'
);
create policy "tickets_staff_all" on public.tickets for all using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff','admin'))
);

-- PROGRAM_CONFIG
create policy "config_read_all" on public.program_config for select using (auth.uid() is not null);
create policy "config_admin" on public.program_config for all using (
  exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
);

-- 3. RPC PARA ACTIVACIÓN DE PARTICIPANTES
-- -----------------------------------------

create or replace function public.activate_participant(p_code text, p_auth_id uuid)
returns jsonb as $$
declare
  v_profile public.profiles;
begin
  select * into v_profile from public.profiles
    where activation_code = p_code and role = 'participant';

  if not found then
    return jsonb_build_object('success', false, 'error', 'Código no válido');
  end if;

  update public.profiles
    set id = p_auth_id, activation_code = null
    where activation_code = p_code;

  return jsonb_build_object('success', true, 'name', v_profile.first_name);
end;
$$ language plpgsql security definer;

-- 4. FUNCIÓN PARA PRE-REGISTRAR PARTICIPANTE (sin auth user aún)
-- -----------------------------------------

create or replace function public.preregister_participant(
  p_first_name text,
  p_last_name text,
  p_whatsapp text,
  p_email text,
  p_cohort text,
  p_code text,
  p_staff_id uuid,
  p_emergency_first_name text default null,
  p_emergency_last_name text default null,
  p_emergency_phone text default null
)
returns jsonb as $$
begin
  insert into public.profiles (
    id, role, first_name, last_name, whatsapp, staff_id, cohort,
    activation_code, emergency_first_name, emergency_last_name, emergency_phone
  ) values (
    gen_random_uuid(), 'participant', p_first_name, p_last_name, p_whatsapp,
    p_staff_id, p_cohort, p_code,
    p_emergency_first_name, p_emergency_last_name, p_emergency_phone
  );
  return jsonb_build_object('success', true, 'code', p_code);
end;
$$ language plpgsql security definer;

-- 5. TRIGGER: crear perfil automático al registrar staff/admin
-- -----------------------------------------

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, first_name)
  values (new.id, 'staff', new.raw_user_meta_data->>'first_name')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 6. STORAGE BUCKET
-- -----------------------------------------

insert into storage.buckets (id, name, public) values ('ticket-photos', 'ticket-photos', false);

create policy "upload_own_photos" on storage.objects for insert with check (
  bucket_id = 'ticket-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "read_own_photos" on storage.objects for select using (
  bucket_id = 'ticket-photos' and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "staff_read_photos" on storage.objects for select using (
  bucket_id = 'ticket-photos' and exists(
    select 1 from public.profiles p where p.id = auth.uid() and p.role in ('staff','admin')
  )
);
