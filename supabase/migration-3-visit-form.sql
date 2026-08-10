-- Visit form upgrades: quick customer info and a revisit flag.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

alter table public.visits add column customer_name text;
alter table public.visits add column customer_phone text;
alter table public.visits add column follow_up boolean not null default false;
