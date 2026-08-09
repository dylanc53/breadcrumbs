-- Breadcrumbs schema: multi-tenant from day one.
-- Run this once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- ============ Tables ============

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text unique not null default substr(md5(random()::text), 1, 6),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid not null references public.orgs (id),
  name text not null,
  role text not null default 'rep' check (role in ('rep', 'manager')),
  created_at timestamptz not null default now()
);

create table public.routes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  rep_id uuid not null references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  path jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table public.visits (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  rep_id uuid not null references public.profiles (id) on delete cascade,
  route_id uuid references public.routes (id) on delete set null,
  lat double precision not null,
  lng double precision not null,
  address text,
  neighborhood text,
  city text,
  zip text,
  status text not null check (status in ('cold', 'warm', 'hot')),
  note text not null default '',
  created_at timestamptz not null default now()
);

create index visits_org_idx on public.visits (org_id, created_at);
create index visits_rep_idx on public.visits (rep_id, created_at);
create index routes_org_idx on public.routes (org_id, started_at);
create index routes_rep_idx on public.routes (rep_id, started_at);

-- ============ Helpers ============
-- security definer so these can read profiles without tripping RLS recursion

create or replace function public.my_org()
returns uuid language sql stable security definer set search_path = public as
$$ select org_id from profiles where id = auth.uid() $$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

-- Signup flows: first user creates the org (becomes manager),
-- everyone else joins with the org's 6-character code (becomes rep)

create or replace function public.create_org_and_join(org_name text, user_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  new_org uuid;
begin
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'You already belong to a team';
  end if;
  insert into orgs (name) values (org_name) returning id into new_org;
  insert into profiles (id, org_id, name, role)
  values (auth.uid(), new_org, user_name, 'manager');
end $$;

create or replace function public.join_org_with_code(code text, user_name text)
returns void language plpgsql security definer set search_path = public as $$
declare
  target uuid;
begin
  if exists (select 1 from profiles where id = auth.uid()) then
    raise exception 'You already belong to a team';
  end if;
  select id into target from orgs where join_code = lower(trim(code));
  if target is null then
    raise exception 'Invalid join code';
  end if;
  insert into profiles (id, org_id, name, role)
  values (auth.uid(), target, user_name, 'rep');
end $$;

grant execute on function public.create_org_and_join(text, text) to authenticated;
grant execute on function public.join_org_with_code(text, text) to authenticated;

-- ============ Row-level security ============

alter table public.orgs enable row level security;
alter table public.profiles enable row level security;
alter table public.routes enable row level security;
alter table public.visits enable row level security;

create policy "members read their org" on public.orgs
  for select using (id = public.my_org());

create policy "read org profiles" on public.profiles
  for select using (org_id = public.my_org() or id = auth.uid());
create policy "update own profile" on public.profiles
  for update using (id = auth.uid());

create policy "read org visits" on public.visits
  for select using (org_id = public.my_org());
create policy "insert own visits" on public.visits
  for insert with check (rep_id = auth.uid() and org_id = public.my_org());
create policy "update own or manager visits" on public.visits
  for update using (
    rep_id = auth.uid()
    or (org_id = public.my_org() and public.my_role() = 'manager')
  );
create policy "delete own or manager visits" on public.visits
  for delete using (
    rep_id = auth.uid()
    or (org_id = public.my_org() and public.my_role() = 'manager')
  );

create policy "read org routes" on public.routes
  for select using (org_id = public.my_org());
create policy "insert own routes" on public.routes
  for insert with check (rep_id = auth.uid() and org_id = public.my_org());
create policy "update own or manager routes" on public.routes
  for update using (
    rep_id = auth.uid()
    or (org_id = public.my_org() and public.my_role() = 'manager')
  );
create policy "delete own or manager routes" on public.routes
  for delete using (
    rep_id = auth.uid()
    or (org_id = public.my_org() and public.my_role() = 'manager')
  );
