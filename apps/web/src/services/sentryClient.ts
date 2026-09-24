/**
 * The only parts of `@sentry/browser` Suffa uses. Imported lazily by `errorTracking.ts`,
 * so named imports let the bundler drop replay, feedback and tracing (~70 % of the SDK).
 */
export { captureException, captureMessage, init, withScope } from '@sentry/browser';
