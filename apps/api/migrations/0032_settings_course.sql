-- The learner's own course choice (ADR-0025), synced like the other settings. Older app
-- versions do not send it; they keep the first course.
alter table settings add column if not exists course text not null default 'bayna-yadayk';
alter table settings drop constraint if exists settings_course_check;
alter table settings add constraint settings_course_check
  check (course in ('bayna-yadayk', 'madinah'));
