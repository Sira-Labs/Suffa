/**
 * Interface language (story 16.3, ADR-0021). i18next with one catalogue per module
 * (namespace): German is bundled and loaded synchronously, English is loaded on demand.
 *
 * The chosen language is a synced setting (`uiLanguage`); a copy in localStorage lets the
 * app start in that language before the settings are read from IndexedDB.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { de } from './locales/de';

export const UI_LANGUAGES = ['de', 'en'] as const;
export type UiLanguage = (typeof UI_LANGUAGES)[number];
export const DEFAULT_UI_LANGUAGE: UiLanguage = 'de';

const STORAGE_KEY = 'suffa.uiLanguage';

export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === 'string' && (UI_LANGUAGES as readonly string[]).includes(value);
}

void i18n.use(initReactI18next).init({
  resources: { de },
  lng: DEFAULT_UI_LANGUAGE,
  fallbackLng: DEFAULT_UI_LANGUAGE,
  defaultNS: 'common',
  ns: Object.keys(de),
  // React escapes already.
  interpolation: { escapeValue: false },
  returnNull: false,
  // Synchronous init: the first render already has the German texts.
  initAsync: false,
  showSupportNotice: false,
});

/** Loads a language's catalogues once (German is always there). */
async function loadCatalogues(language: UiLanguage): Promise<void> {
  if (language === 'de' || i18n.hasResourceBundle(language, 'common')) return;
  const { en } = await import('./locales/en');
  for (const [ns, messages] of Object.entries(en)) {
    i18n.addResourceBundle(language, ns, messages, true, true);
  }
}

/** The language kept on this device, if any. */
export function storedUiLanguage(): UiLanguage | null {
  try {
    const value = globalThis.localStorage?.getItem(STORAGE_KEY);
    return isUiLanguage(value) ? value : null;
  } catch {
    return null;
  }
}

/** Switches the interface language; unknown values fall back to German. */
export async function setUiLanguage(language: string | null | undefined): Promise<void> {
  const next = isUiLanguage(language) ? language : DEFAULT_UI_LANGUAGE;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, next);
  } catch {
    // Storage blocked: the synced setting still applies after the next sign-in.
  }
  if (i18n.language === next) return;
  await loadCatalogues(next);
  await i18n.changeLanguage(next);
  if (typeof document !== 'undefined') document.documentElement.lang = next;
}

/** At start-up, before the first render: the language this device used last time. */
export async function initUiLanguage(): Promise<void> {
  const stored = storedUiLanguage();
  if (stored && stored !== DEFAULT_UI_LANGUAGE) await setUiLanguage(stored);
}

export default i18n;
