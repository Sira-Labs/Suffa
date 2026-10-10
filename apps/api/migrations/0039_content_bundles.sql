-- Content bundles (story 16.2, ADR-0014): every publish freezes all published units into one
-- immutable, checksummed JSON document. Clients learn the newest version from
-- /api/v1/content/manifest and fetch /api/v1/content/bundles/:version (cached forever).

create table if not exists content_bundles (
  version         integer primary key check (version > 0),
  -- sha256 (hex) of `body`, exactly as served.
  checksum        text not null check (checksum ~ '^[0-9a-f]{64}$'),
  -- The JSON document as served; never changed after insert.
  body            text not null,
  size_bytes      integer not null,
  unit_count      integer not null,
  tombstone_count integer not null,
  created_by      uuid references users (id) on delete set null,
  created_at      timestamptz not null default now()
);

-- A bundle is immutable: deletes and changes of its content are refused. Only `created_by`
-- may change, when the account behind it is deleted (on delete set null).
create or replace function content_bundles_immutable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE'
     and new.version = old.version
     and new.checksum = old.checksum
     and new.body = old.body
     and new.created_by is null then
    return new;
  end if;
  raise exception 'content bundles are immutable';
end;
$$;

drop trigger if exists content_bundles_immutable on content_bundles;
create trigger content_bundles_immutable
  before update or delete on content_bundles
  for each row execute function content_bundles_immutable();
