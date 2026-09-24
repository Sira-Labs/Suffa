-- Sign-in with Better Auth (ADR-0008): magic link only.
--
-- * `users` stays the one user table; Better Auth maps its fields onto it.
-- * Sessions, verification tokens (magic links, stored hashed) and rate-limit counters live
--   in their own tables; `accounts` is kept for later sign-in methods (e.g. teacher SSO).
-- * Column names are snake_case; the auth configuration maps Better Auth's field names.

alter table users add column if not exists email_verified boolean not null default false;
alter table users add column if not exists image text;

create table if not exists sessions (
  id          text primary key,
  user_id     uuid not null references users (id) on delete cascade,
  token       text not null unique,
  expires_at  timestamptz not null,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions (user_id);

create table if not exists accounts (
  id                       text primary key,
  user_id                  uuid not null references users (id) on delete cascade,
  account_id               text not null,
  provider_id              text not null,
  access_token             text,
  refresh_token            text,
  id_token                 text,
  access_token_expires_at  timestamptz,
  refresh_token_expires_at timestamptz,
  scope                    text,
  password                 text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);
create index if not exists accounts_user_idx on accounts (user_id);

create table if not exists verifications (
  id          text primary key,
  identifier  text not null,
  value       text not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists verifications_identifier_idx on verifications (identifier);

create table if not exists rate_limits (
  id            text primary key,
  key           text not null unique,
  count         integer not null,
  last_request  bigint not null
);
