-- Admin area (story 4.2, ADR-0009).
--
-- * users.disabled_at: a disabled user cannot use any session (checked on every request).
-- * audit_log: every privileged change, append-only; details never hold secrets.
-- * second factor: admins confirm admin actions with an authenticator app (TOTP). The secret
--   is stored encrypted; last_step refuses replaying a code; failed attempts lock briefly.
-- * sessions.second_factor_at: when this session last confirmed the second factor.

alter table users add column if not exists disabled_at timestamptz;

create table if not exists audit_log (
  id          bigserial primary key,
  actor_id    uuid references users (id) on delete set null,
  action      text not null,
  target_type text not null,
  target_id   text not null,
  details     jsonb not null default '{}'::jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_created_idx on audit_log (created_at desc, id desc);
create index if not exists audit_log_target_idx on audit_log (target_type, target_id);

create table if not exists user_totp (
  user_id      uuid primary key references users (id) on delete cascade,
  secret_enc   text not null,
  enabled_at   timestamptz,
  last_step    bigint,
  failed_count integer not null default 0,
  locked_until timestamptz,
  created_at   timestamptz not null default now()
);

alter table sessions add column if not exists second_factor_at timestamptz;
