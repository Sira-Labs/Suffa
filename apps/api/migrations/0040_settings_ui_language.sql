-- Interface language (story 16.3, ADR-0021): settings."uiLanguage" is 'de' (default when
-- null) or 'en'. Older app versions do not send it; the sync then keeps the stored value.
alter table settings add column if not exists "uiLanguage" text;
alter table settings drop constraint if exists settings_ui_language_check;
alter table settings add constraint settings_ui_language_check
  check ("uiLanguage" is null or "uiLanguage" in ('de', 'en'));
