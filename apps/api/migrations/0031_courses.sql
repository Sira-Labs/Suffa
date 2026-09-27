-- Courses (ADR-0025): each class follows one textbook stream. Existing classes keep the book
-- they were made for. Each course owns a band of unit numbers (Al-Arabiyya bayna Yadayk 1–16,
-- Medina course book n: n01–n99), so the unit checks below make room for three-digit units.
alter table classes add column if not exists course text not null default 'bayna-yadayk';
alter table classes drop constraint if exists classes_course_check;
alter table classes add constraint classes_course_check
  check (course in ('bayna-yadayk', 'madinah'));

alter table certificates drop constraint if exists certificates_unit_check;
alter table certificates add constraint certificates_unit_check
  check (unit between 1 and 999);

alter table videos drop constraint if exists videos_unit_check;
alter table videos add constraint videos_unit_check
  check (unit between 1 and 999);
