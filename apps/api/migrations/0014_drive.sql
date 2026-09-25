-- Google Drive connection per teacher (story 7.2, ADR-0018): the OAuth refresh token for the
-- `drive.file` scope, sealed with AES-256-GCM (key derived from SUFFA_AUTH_SECRET).
create table if not exists drive_connections (
  user_id              uuid primary key references users (id) on delete cascade,
  refresh_token_sealed text not null,
  connected_at         timestamptz not null default now()
);
