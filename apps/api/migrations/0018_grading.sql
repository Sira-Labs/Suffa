-- Grading by al-Muʿallim and the teacher's review (Sprint 11, ADR-0011).

create table if not exists ai_grades (
  id          uuid primary key,
  user_id     uuid not null references users (id) on delete cascade,
  -- The class whose teacher reviews it (the learner's class at grading time), if any.
  class_id    uuid references classes (id) on delete set null,
  kind        text not null check (kind in ('writing', 'speech')),
  task        text not null default '',
  answer      text not null,
  -- The model's rubric: score, rubric points, summary, corrected text, mistakes.
  result      jsonb not null,
  model       text,
  status      text not null default 'auto' check (status in ('auto', 'confirmed', 'overridden')),
  -- The teacher's verdict when they changed it: score, comment, corrected text.
  override    jsonb,
  reviewed_by uuid references users (id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists ai_grades_user_idx on ai_grades (user_id, created_at desc);
create index if not exists ai_grades_class_idx on ai_grades (class_id, status, created_at desc);
