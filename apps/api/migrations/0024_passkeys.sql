-- Passkeys (ADR-0008 update 2026-09-26): WebAuthn credentials of Better Auth's passkey plugin,
-- as an optional, faster way in next to the emailed link and code. The public key is no secret,
-- but the API never returns it: /api/v1/account/passkeys lists only names, providers and dates.
-- Removing a user removes their passkeys.

create table if not exists passkeys (
  id             text primary key,
  user_id        uuid not null references users (id) on delete cascade,
  name           text,
  public_key     text not null,
  credential_id  text not null unique,
  -- Signature counter; authenticators that do not count report 0.
  counter        bigint not null default 0,
  device_type    text not null,
  backed_up      boolean not null default false,
  transports     text,
  aaguid         text,
  created_at     timestamptz not null default now()
);
create index if not exists passkeys_user_idx on passkeys (user_id);
