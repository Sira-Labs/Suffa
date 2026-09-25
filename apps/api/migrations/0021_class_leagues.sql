-- Weekly class league (story 14.2, ADR-0016): opt-in on both sides and off by default.
--
-- * classes.minors marks a class of under-18s; the league stays off unless the teacher turns
--   it on deliberately, and names are shortened to first names there.
-- * classes.league_enabled is the teacher's switch; class_members.league_opt_in is each
--   learner's own choice. Only learners who opted in are ranked, by % of their own weekly goal.

alter table classes add column if not exists minors boolean not null default false;
alter table classes add column if not exists league_enabled boolean not null default false;
alter table class_members add column if not exists league_opt_in boolean not null default false;
