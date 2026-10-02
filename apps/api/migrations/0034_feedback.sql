-- Feedback while testing (staging): anyone using the app sends an impression from any page.
-- Signed-in senders are linked so the team can ask back. Deleting the account deletes their
-- feedback too (the text may say who they are); the export includes it.
create table if not exists feedback (
  id uuid primary key,
  user_id uuid references users(id) on delete cascade,
  kind text not null check (kind in ('bug', 'idea', 'confusing', 'praise')),
  message text not null check (char_length(message) between 1 and 4000),
  page text not null check (char_length(page) between 1 and 300),
  app_version text not null default '',
  user_agent text not null default '',
  status text not null default 'new' check (status in ('new', 'done')),
  created_at timestamptz not null default now()
);

create index if not exists feedback_created_idx on feedback (created_at desc, id desc);
