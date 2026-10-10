-- Meaning language (story 16.4, ADR-0021): settings."meaningLanguage" is 'de' or 'en'; null
-- follows the interface language. Older app versions do not send it; the sync then keeps the
-- stored value.
alter table settings add column if not exists "meaningLanguage" text;
alter table settings drop constraint if exists settings_meaning_language_check;
alter table settings add constraint settings_meaning_language_check
  check ("meaningLanguage" is null or "meaningLanguage" in ('de', 'en'));
