-- Candidate Pool — Supabase schema with row-level security.
-- Run once in Supabase Dashboard › SQL Editor.
--
-- Rules enforced here (the website cannot bypass them):
--   * Admin (HR): read/write every candidate, every pool, every status; manage profiles.
--   * PJT account: read the central pool ('HR') and its own pool only;
--     may pick from the central pool into its own pool, return its own candidates
--     to the central pool, and set decision / interview details on its own candidates.
--   * Deactivated accounts (profiles.active = false) can do nothing.

-- ---------- tables ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('admin', 'pjt')),
  unit        text check (unit in ('PJT-PD-1', 'PJT-PD-2', 'PJT-PD-3', 'PJT-PD-4')),
  owner_name  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  check ((role = 'admin' and unit is null) or (role = 'pjt' and unit is not null))
);

create table if not exists public.candidates (
  id               text primary key,
  name             text not null,
  position         text,
  age              int,
  experience       int,
  education        text,
  company          text,
  cv_url           text,
  salary_current   int,
  salary_expected  int,
  hr_match         numeric(4, 3) check (hr_match between 0 and 1),
  prescreen_date   date,
  recommendation   text,
  hr_note          text,
  decision         text not null default 'รอพิจารณา'
                   check (decision in ('รอพิจารณา', 'เรียกสัมภาษณ์', 'นัดสัมภาษณ์แล้ว', 'ผ่านการพิจารณา', 'สำรอง', 'ไม่ผ่านการพิจารณา', 'อื่นๆ')),
  decision_note    text check (decision_note is null or char_length(decision_note) between 1 and 60),
  interview_at     timestamptz,
  interviewer      text,
  project_name     text,
  remark           text,
  location         text not null default 'HR'
                   check (location in ('HR', 'PJT-PD-1', 'PJT-PD-2', 'PJT-PD-3', 'PJT-PD-4')),
  assigned_by      text,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references auth.users (id)
);
create index if not exists candidates_location_idx on public.candidates (location);

-- ---------- helpers ----------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from profiles where id = auth.uid() and active), false)
$$;

create or replace function public.my_unit() returns text
language sql stable security definer set search_path = public as $$
  select unit from profiles where id = auth.uid() and active and role = 'pjt'
$$;

create or replace function public.touch_candidate() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
drop trigger if exists candidates_touch on public.candidates;
create trigger candidates_touch before insert or update on public.candidates
  for each row execute function public.touch_candidate();

-- ---------- row-level security ----------
alter table public.profiles enable row level security;
alter table public.candidates enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists candidates_read on public.candidates;
create policy candidates_read on public.candidates for select to authenticated
  using (public.is_admin() or (public.my_unit() is not null and location in ('HR', public.my_unit())));
drop policy if exists candidates_admin_insert on public.candidates;
create policy candidates_admin_insert on public.candidates for insert to authenticated
  with check (public.is_admin());
drop policy if exists candidates_admin_update on public.candidates;
create policy candidates_admin_update on public.candidates for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists candidates_admin_delete on public.candidates;
create policy candidates_admin_delete on public.candidates for delete to authenticated
  using (public.is_admin());

-- ---------- PJT actions (the only way a PJT account can change data) ----------
create or replace function public.pjt_pick(p_id text) returns public.candidates
language plpgsql security definer set search_path = public as $$
declare u text := my_unit(); r candidates;
begin
  if u is null then raise exception 'บัญชีนี้ไม่มีสิทธิ์เลือกผู้สมัคร'; end if;
  update candidates set location = u, assigned_by = u, decision = 'รอพิจารณา',
         interview_at = null, interviewer = null, project_name = null, remark = null
   where id = p_id and location = 'HR'
  returning * into r;
  if not found then raise exception '% ไม่อยู่ในคลังกลางแล้ว อาจถูกหน่วยงานอื่นเลือกไป', p_id; end if;
  return r;
end $$;

create or replace function public.pjt_return(p_id text) returns public.candidates
language plpgsql security definer set search_path = public as $$
declare u text := my_unit(); r candidates;
begin
  if u is null then raise exception 'บัญชีนี้ไม่มีสิทธิ์'; end if;
  update candidates set location = 'HR', assigned_by = null, decision = 'รอพิจารณา',
         interview_at = null, interviewer = null, project_name = null, remark = null
   where id = p_id and location = u
  returning * into r;
  if not found then raise exception '% ไม่ได้อยู่ใน Pool ของ %', p_id, u; end if;
  return r;
end $$;

create or replace function public.pjt_set_decision(p_id text, p_decision text) returns public.candidates
language plpgsql security definer set search_path = public as $$
declare u text := my_unit(); r candidates;
begin
  if u is null then raise exception 'บัญชีนี้ไม่มีสิทธิ์'; end if;
  update candidates set decision = p_decision,
         interview_at = case when p_decision in ('เรียกสัมภาษณ์', 'นัดสัมภาษณ์แล้ว') then interview_at end,
         interviewer  = case when p_decision in ('เรียกสัมภาษณ์', 'นัดสัมภาษณ์แล้ว') then interviewer end,
         project_name = case when p_decision in ('เรียกสัมภาษณ์', 'นัดสัมภาษณ์แล้ว') then project_name end,
         remark       = case when p_decision in ('เรียกสัมภาษณ์', 'นัดสัมภาษณ์แล้ว') then remark end
   where id = p_id and location = u
  returning * into r;
  if not found then raise exception '% ไม่ได้อยู่ใน Pool ของ %', p_id, u; end if;
  return r;
end $$;

create or replace function public.pjt_schedule(p_id text, p_at timestamptz, p_interviewer text,
                                               p_project text, p_remark text) returns public.candidates
language plpgsql security definer set search_path = public as $$
declare u text := my_unit(); r candidates;
begin
  if u is null then raise exception 'บัญชีนี้ไม่มีสิทธิ์'; end if;
  if p_at is null then raise exception 'กรุณาระบุวันและเวลาสัมภาษณ์'; end if;
  update candidates set decision = 'นัดสัมภาษณ์แล้ว', interview_at = p_at,
         interviewer = p_interviewer, project_name = p_project, remark = p_remark
   where id = p_id and location = u
  returning * into r;
  if not found then raise exception '% ไม่ได้อยู่ใน Pool ของ %', p_id, u; end if;
  return r;
end $$;

revoke execute on function public.pjt_pick(text), public.pjt_return(text),
  public.pjt_set_decision(text, text), public.pjt_schedule(text, timestamptz, text, text, text)
  from public, anon;
grant execute on function public.pjt_pick(text), public.pjt_return(text),
  public.pjt_set_decision(text, text), public.pjt_schedule(text, timestamptz, text, text, text)
  to authenticated;

-- ---------- creating accounts ----------
-- Next: create the 5 users listed in supabase/002_accounts.sql, then run that file.
