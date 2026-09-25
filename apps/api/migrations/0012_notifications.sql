-- Notifications (Sprint 6): Web Push subscriptions per device, reminder preferences, a log
-- that enforces "at most one reminder a day", and the weekly recap.

create table if not exists push_subscriptions (
  id              uuid primary key,
  user_id         uuid not null references users (id) on delete cascade,
  endpoint        text not null unique check (length(endpoint) <= 1000),
  p256dh          text not null check (length(p256dh) <= 200),
  auth            text not null check (length(auth) <= 100),
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz,
  failures        integer not null default 0
);
create index if not exists push_subscriptions_user_idx on push_subscriptions (user_id);

-- Times are local ("HH:MM") in the account's time zone.
create table if not exists notification_prefs (
  user_id          uuid primary key references users (id) on delete cascade,
  reminder_enabled boolean not null default false,
  reminder_time    text not null default '18:00' check (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_start      text not null default '22:00' check (quiet_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  quiet_end        text not null default '07:00' check (quiet_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  weekly_recap     boolean not null default true,
  updated_at       timestamptz not null default now()
);

-- One row per notification kind and local day: the primary key is the daily limit.
create table if not exists notification_log (
  user_id uuid not null references users (id) on delete cascade,
  kind    text not null,
  day     date not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, kind, day)
);

-- The learner's week in numbers, generated on Sunday evening in their time zone.
create table if not exists weekly_recaps (
  user_id    uuid not null references users (id) on delete cascade,
  week_start date not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
