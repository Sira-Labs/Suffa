-- Invite links for one live session: the teacher shares a link (or its QR code) for a lesson.
-- Members of the class land at the session; anyone else asks to join the class, as with the
-- class's own invite link, which this leaves untouched. Only the SHA-256 of the token is kept;
-- a link works while its session is planned or live (until its end plus the overrun), and one
-- link per session at a time (creating a new one replaces the old).

create table if not exists live_invites (
  token_hash text primary key,
  session_id uuid not null unique references live_sessions (id) on delete cascade,
  created_by uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);
