-- Classes (story 4.3, ADR-0009): a teacher creates a class, shares an invite link (QR),
-- learners join and wait until the teacher approves them.
--
-- * class_members.class_role decides data scope (a teacher sees only classes they teach);
--   status 'pending' until approved.
-- * class_invites stores only the SHA-256 of the invite token; one active invite per class
--   (creating a new one revokes the old), 14 days by default.

create table if not exists classes (
  id          uuid primary key,
  name        text not null check (length(name) between 1 and 80),
  created_by  uuid references users (id) on delete set null,
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists class_members (
  class_id    uuid not null references classes (id) on delete cascade,
  user_id     uuid not null references users (id) on delete cascade,
  class_role  text not null check (class_role in ('teacher', 'student')),
  status      text not null check (status in ('pending', 'active')),
  joined_at   timestamptz not null default now(),
  approved_at timestamptz,
  primary key (class_id, user_id)
);
create index if not exists class_members_user_idx on class_members (user_id);

create table if not exists class_invites (
  token_hash text primary key,
  class_id   uuid not null references classes (id) on delete cascade,
  created_by uuid references users (id) on delete set null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists class_invites_class_idx on class_invites (class_id);
