-- Live class quiz (story 14.4): the teacher runs a Kahoot-like quiz on the projector from the
-- class's leech words; learners answer on their phones. The quiz row is the single source of
-- truth; `version` is bumped on every change so open event streams know when to resend.
--
-- At most one quiz per class is running at a time (partial unique index).

create table if not exists live_quizzes (
  id                  uuid primary key,
  class_id            uuid not null references classes (id) on delete cascade,
  created_by          uuid references users (id) on delete set null,
  status              text not null check (status in ('lobby', 'question', 'reveal', 'finished')),
  questions           jsonb not null,
  current             integer not null default -1,
  question_started_at timestamptz,
  version             integer not null default 1,
  created_at          timestamptz not null default now(),
  finished_at         timestamptz
);
create unique index if not exists live_quizzes_running_idx
  on live_quizzes (class_id) where status <> 'finished';

create table if not exists live_quiz_players (
  quiz_id   uuid not null references live_quizzes (id) on delete cascade,
  user_id   uuid not null references users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (quiz_id, user_id)
);

create table if not exists live_quiz_answers (
  quiz_id     uuid not null references live_quizzes (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  question    integer not null,
  choice      integer not null,
  correct     boolean not null,
  points      integer not null,
  answered_at timestamptz not null,
  primary key (quiz_id, user_id, question)
);
