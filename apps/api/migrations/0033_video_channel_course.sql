-- Courses (ADR-0025): each video channel teaches one course, so an import can tell "Lesson 5"
-- apart: unit 5 for Al-Arabiyya bayna Yadayk, unit 105 for the Medina course. Existing
-- channels keep the book they were added for.
alter table video_channels add column if not exists course text not null default 'bayna-yadayk';
alter table video_channels drop constraint if exists video_channels_course_check;
alter table video_channels add constraint video_channels_course_check
  check (course in ('bayna-yadayk', 'madinah'));
