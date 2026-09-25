-- Unit certificates (story 14.3): a teacher awards "Unit n complete" once a learner has at
-- least 90 % of the unit's words firmly in memory (mature cards, interval >= 21 days). The
-- server checks the mastery again when awarding and keeps what it saw.
--
-- One certificate per learner and unit (whichever class it was awarded in). The class and
-- the awarding teacher may disappear later; the certificate stays with the learner.

create table if not exists certificates (
  id          uuid primary key,
  user_id     uuid not null references users (id) on delete cascade,
  unit        integer not null check (unit between 1 and 99),
  mastery     integer not null check (mastery between 0 and 100),
  class_id    uuid references classes (id) on delete set null,
  class_name  text not null,
  awarded_by  uuid references users (id) on delete set null,
  teacher_name text,
  awarded_at  timestamptz not null default now(),
  unique (user_id, unit)
);
create index if not exists certificates_class_idx on certificates (class_id);
