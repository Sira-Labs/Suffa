-- Class spirit (Sprint 6, engagement plan §3): the teacher's weekly class challenge,
-- badges the teacher creates and awards, and shout-outs to the class or one learner.

-- One cooperative target per class and week (week_start = Monday in the teacher's zone).
create table if not exists class_challenges (
  id          uuid primary key,
  class_id    uuid not null references classes (id) on delete cascade,
  week_start  date not null,
  time_zone   text not null check (length(time_zone) between 1 and 64),
  template    text not null check (template in ('reviews', 'quests', 'xp', 'active-days')),
  target      integer not null check (target between 1 and 100000),
  created_by  uuid references users (id) on delete set null,
  created_at  timestamptz not null default now(),
  reached_at  timestamptz,
  unique (class_id, week_start)
);

-- Who helped reach a challenge (for the "Rūḥ al-Faṣl" badge).
create table if not exists class_challenge_contributors (
  challenge_id uuid not null references class_challenges (id) on delete cascade,
  user_id      uuid not null references users (id) on delete cascade,
  primary key (challenge_id, user_id)
);
create index if not exists class_challenge_contributors_user_idx
  on class_challenge_contributors (user_id);

create table if not exists teacher_badges (
  id         uuid primary key,
  class_id   uuid not null references classes (id) on delete cascade,
  name       text not null check (length(name) between 1 and 40),
  icon       text not null,
  message    text not null default '' check (length(message) <= 200),
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists teacher_badges_class_idx on teacher_badges (class_id);

create table if not exists teacher_badge_awards (
  badge_id   uuid not null references teacher_badges (id) on delete cascade,
  user_id    uuid not null references users (id) on delete cascade,
  awarded_by uuid references users (id) on delete set null,
  awarded_at timestamptz not null default now(),
  primary key (badge_id, user_id)
);
create index if not exists teacher_badge_awards_user_idx on teacher_badge_awards (user_id);

-- A shout-out goes to the whole class (user_id null) or to one learner.
create table if not exists class_shoutouts (
  id         uuid primary key,
  class_id   uuid not null references classes (id) on delete cascade,
  author_id  uuid references users (id) on delete set null,
  user_id    uuid references users (id) on delete cascade,
  message    text not null check (length(message) between 1 and 280),
  created_at timestamptz not null default now()
);
create index if not exists class_shoutouts_class_idx on class_shoutouts (class_id, created_at desc);
