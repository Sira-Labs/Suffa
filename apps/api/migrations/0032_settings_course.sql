-- The learner's own course choice (ADR-0025), synced like the other settings. Null means the
-- default course: older app versions do not send it, and the sync then keeps the stored value.
alter table settings add column if not exists course text;
alter table settings drop constraint if exists settings_course_check;
alter table settings add constraint settings_course_check
  check (course is null or course in ('bayna-yadayk', 'madinah'));
