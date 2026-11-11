-- Candidate Pool — usage log for HRS's "การใช้งาน" tab.
-- Run AFTER 013_more_decisions.sql. Safe to run more than once. Existing data is kept.
--
-- Every signed-in account adds a row when it does something (sign in, pick a candidate,
-- request an interview, compare, open a profile, ...). The database fills in who and when,
-- so an account cannot write rows in another account's name. Only HRS can read the log;
-- nobody can change or delete rows through the API.

create table if not exists public.usage_events (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  user_id      uuid,
  role         text,
  unit         text,
  action       text not null check (action ~ '^[a-z_]{2,40}$'),
  candidate_id text check (candidate_id is null or char_length(candidate_id) <= 40),
  meta         jsonb not null default '{}'::jsonb check (pg_column_size(meta) <= 2000)
);
create index if not exists usage_events_at_idx on public.usage_events (at desc);

-- Who and when always come from the signed-in session, never from the request.
create or replace function public.usage_events_stamp() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.at := now();
  select p.role, p.unit into new.role, new.unit from profiles p where p.id = auth.uid();
  return new;
end $$;
drop trigger if exists usage_events_stamp on public.usage_events;
create trigger usage_events_stamp before insert on public.usage_events
  for each row execute function public.usage_events_stamp();

alter table public.usage_events enable row level security;
drop policy if exists usage_events_insert on public.usage_events;
create policy usage_events_insert on public.usage_events for insert to authenticated
  with check (auth.uid() is not null);
drop policy if exists usage_events_admin_read on public.usage_events;
create policy usage_events_admin_read on public.usage_events for select to authenticated
  using (public.is_admin());

revoke all on public.usage_events from anon, authenticated;
grant insert (action, candidate_id, meta) on public.usage_events to authenticated;
grant select on public.usage_events to authenticated;

notify pgrst, 'reload schema';

-- Check: one row, rls_on = true.
select relrowsecurity as rls_on, (select count(*) from public.usage_events) as events
  from pg_class where oid = 'public.usage_events'::regclass;
