-- Liveness records written by worker instances (and later other background roles).
create table if not exists service_heartbeats (
  role      text        not null,
  instance  text        not null,
  version   text        not null,
  beat_at   timestamptz not null default now(),
  primary key (role, instance)
);
