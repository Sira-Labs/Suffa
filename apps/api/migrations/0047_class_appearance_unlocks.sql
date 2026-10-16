-- Class settings (stories 18.1 and 18.2): the colour scheme the teacher picks for the class,
-- and when its practice areas open (an object of area → rule; a missing area follows the
-- app's default, e.g. roots from unit 3). Learners choose in their own settings whether they
-- follow their class's colours ("palette" null or 'class') or pick one themselves.

alter table classes
  add column if not exists palette text not null default 'oase'
    check (palette in ('oase', 'meer', 'minze', 'lavendel', 'sand')),
  add column if not exists unlocks jsonb not null default '{}'::jsonb
    check (jsonb_typeof(unlocks) = 'object');

alter table settings add column if not exists palette text;
alter table settings drop constraint if exists settings_palette_check;
alter table settings add constraint settings_palette_check
  check (palette is null or palette in ('class', 'oase', 'meer', 'minze', 'lavendel', 'sand'));
