-- Customer email on visits.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

alter table public.visits add column customer_email text;
