-- Per-team sales region (jsonb: { name, bounds: [[w,s],[e,n]] }; null =
-- whole US) and permission for managers to edit their org.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

alter table public.orgs add column region jsonb;

create policy "manager updates org" on public.orgs
  for update using (id = public.my_org() and public.my_role() = 'manager');
