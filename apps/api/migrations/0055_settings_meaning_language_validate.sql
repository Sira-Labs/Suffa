-- Validates the check added by 0054 for the rows that were there before it (all 'de', 'en'
-- or null). In its own migration, so in its own transaction: validating takes a lock that
-- does not block reads or writes of settings.
alter table settings validate constraint settings_meaning_language_check;
