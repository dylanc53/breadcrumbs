-- Team management: removing a member keeps their pins/routes (rep
-- becomes null -> shown as "Former rep"), and managers get a
-- remove_member() function that deletes the member's login.
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

alter table public.visits alter column rep_id drop not null;
alter table public.visits drop constraint visits_rep_id_fkey;
alter table public.visits add constraint visits_rep_id_fkey
  foreign key (rep_id) references public.profiles (id) on delete set null;

alter table public.routes alter column rep_id drop not null;
alter table public.routes drop constraint routes_rep_id_fkey;
alter table public.routes add constraint routes_rep_id_fkey
  foreign key (rep_id) references public.profiles (id) on delete set null;

create or replace function public.remove_member(member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() <> 'manager' then
    raise exception 'Only managers can remove members';
  end if;
  if member = auth.uid() then
    raise exception 'You cannot remove yourself';
  end if;
  if not exists (
    select 1 from profiles where id = member and org_id = public.my_org()
  ) then
    raise exception 'No such member on your team';
  end if;
  -- Cascades to their profile; their visits/routes stay with rep_id null
  delete from auth.users where id = member;
end $$;

grant execute on function public.remove_member(uuid) to authenticated;
