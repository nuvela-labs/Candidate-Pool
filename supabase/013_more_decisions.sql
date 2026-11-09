-- Candidate Pool — Executive Decision changes, set by HRS:
--   new "ผ่านการพิจารณา"
--   "ไม่พิจารณา" renamed "ไม่ผ่านการพิจารณา" (existing candidates are updated)
--   new "อื่นๆ" — HRS types the status; the text is kept in decision_note and shown instead of "อื่นๆ".
-- Run AFTER 012_pre_interview.sql. Safe to run more than once (also after an earlier copy of this file).
--
-- ผ่านการพิจารณา and อื่นๆ keep the candidate's interview details, like เรียกสัมภาษณ์ / นัดสัมภาษณ์แล้ว.
-- HRS updates candidates through candidates_admin_update, so no new policy is needed.

alter table public.candidates add column if not exists decision_note text
  check (decision_note is null or char_length(decision_note) between 1 and 60);

alter table public.candidates drop constraint if exists candidates_decision_check;
update public.candidates set decision = 'ไม่ผ่านการพิจารณา' where decision = 'ไม่พิจารณา';
alter table public.candidates add constraint candidates_decision_check
  check (decision in ('รอพิจารณา', 'เรียกสัมภาษณ์', 'นัดสัมภาษณ์แล้ว', 'ผ่านการพิจารณา', 'สำรอง', 'ไม่ผ่านการพิจารณา', 'อื่นๆ'));

notify pgrst, 'reload schema';

-- Check: one row listing the 7 statuses, and 0 candidates still on the old wording.
select pg_get_constraintdef(oid) as decision_check,
       (select count(*) from public.candidates where decision = 'ไม่พิจารณา') as old_wording_left
  from pg_constraint
 where conrelid = 'public.candidates'::regclass and conname = 'candidates_decision_check';
