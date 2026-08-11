-- Live location sharing during selling sessions: one row per rep,
-- updated as they move, deleted when they stop; realtime pushes changes
-- to the whole team's maps.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table public.live_locations (
  rep_id uuid primary key references public.profiles (id) on delete cascade,
  org_id uuid not null references public.orgs (id),
  lat double precision not null,
  lng double precision not null,
  updated_at timestamptz not null default now()
);

alter table public.live_locations enable row level security;

create policy "read org live locations" on public.live_locations
  for select using (org_id = public.my_org());
create policy "insert own live location" on public.live_locations
  for insert with check (rep_id = auth.uid() and org_id = public.my_org());
create policy "update own live location" on public.live_locations
  for update using (rep_id = auth.uid());
create policy "delete own or manager live location" on public.live_locations
  for delete using (
    rep_id = auth.uid()
    or (org_id = public.my_org() and public.my_role() = 'manager')
  );

-- Realtime change feed for the team's maps
alter publication supabase_realtime add table public.live_locations;
