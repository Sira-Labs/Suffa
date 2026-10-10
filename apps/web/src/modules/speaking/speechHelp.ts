/**
 * Plain-language help texts for when recording or pronunciation scoring fails –
 * on iPhone with the specific settings that are usually the cause.
 */
import i18n from '@/i18n';
import type { speaking } from '@/i18n/locales/de/speaking';
import type { RecorderFailure } from '@/services/audio';
import type { RecognitionFailure } from '@/services/speech';

export interface HelpContext {
  ios: boolean;
  /** Launched as a Home Screen app (PWA) instead of in a browser tab. */
  standalone: boolean;
}

export function recorderHelp(
  reason: RecorderFailure | 'empty',
  ctx: HelpContext
): string {
  const t = (key: keyof typeof speaking.recorderHelp) =>
    i18n.t(`speaking:recorderHelp.${key}`);
  switch (reason) {
    case 'denied':
      return ctx.ios ? t('deniedIos') : t('denied');
    case 'no-device':
      return t('noDevice');
    case 'busy':
      return t('busy');
    case 'insecure':
      return t('insecure');
    case 'unsupported':
      return ctx.ios ? t('unsupportedIos') : t('unsupported');
    case 'empty':
      return t('empty');
    case 'error':
      return t('error');
  }
}

export function recognitionHelp(reason: RecognitionFailure, ctx: HelpContext): string {
  const t = (
    key: keyof typeof speaking.recognitionHelp,
    values?: { setup: string; standalone?: string }
  ) => i18n.t(`speaking:recognitionHelp.${key}`, values ?? {});
  const setup = t('iosSetup');
  switch (reason) {
    case 'no-speech':
      return t('noSpeech');
    case 'timeout':
      return ctx.ios
        ? t('timeoutIos', {
            setup,
            standalone: ctx.standalone ? t('timeoutStandalone') : '',
          })
        : t('timeout');
    case 'not-allowed':
      return ctx.ios ? t('notAllowedIos') : t('notAllowed');
    case 'service-not-allowed':
      return ctx.ios ? t('serviceNotAllowedIos', { setup }) : t('serviceNotAllowed');
    case 'language-not-supported':
      return ctx.ios ? t('languageIos', { setup }) : t('language');
    case 'audio-capture':
      return t('audioCapture');
    case 'network':
      return t('network');
    case 'unsupported':
      return ctx.ios ? t('unsupportedIos') : t('unsupported');
    case 'error':
      return t('error');
  }
}
