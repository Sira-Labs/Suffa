-- Meaning language (story 18.4, ADR-0033): learners can also choose Turkish, Italian, Bosnian
-- or Albanian. Only widens the check of 0041: the release before this one writes 'de', 'en'
-- or null, which stay allowed.
alter table settings drop constraint if exists settings_meaning_language_check;
alter table settings add constraint settings_meaning_language_check
  check ("meaningLanguage" is null
         or "meaningLanguage" in ('de', 'en', 'tr', 'it', 'bs', 'sq'));
