/** Locale for dates and numbers in the interface language (story 16.3). */
import i18n from './index';

export function dateLocale(): string {
  return i18n.language === 'en' ? 'en-GB' : 'de-DE';
}
