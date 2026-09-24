-- Admin user list (ADR-0009, story 3.2): newest first with keyset pagination on
-- (created_at, id), so pages stay fast however many learners sign up.

create index if not exists users_created_idx on users (created_at desc, id desc);
