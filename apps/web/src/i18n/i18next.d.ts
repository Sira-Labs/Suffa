/** Typed keys for `t()`: unknown keys and namespaces fail the typecheck (story 16.3). */
import 'i18next';
import type { de } from './locales/de';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: typeof de;
    returnNull: false;
  }
}
