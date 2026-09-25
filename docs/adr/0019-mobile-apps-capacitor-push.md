# ADR-0019: App-store apps with Capacitor; push and local notifications

- Status: accepted (implemented in Sprint 13)
- Date: 2026-09-24
- Revises: the "no native apps" non-goal in `01-product-spec.md`

## Context

For the teacher's students, an app from the App Store / Play Store is easier to find than
"install this website", and reliable reminders are central to the engagement plan. iOS only
allows web push for PWAs added to the Home Screen (iOS 16.4+), and background audio/offline
downloads are more robust natively.

## Decision

- Wrap the **same web build** in **Capacitor** (`apps/mobile`), iOS + Android. One codebase;
  native plugins only where needed:
  - `@capacitor/local-notifications` — **daily reminder scheduled on the device**, works offline,
    no server needed (quiet hours respected).
  - `@capacitor/push-notifications` via **FCM** (Android, and iOS through APNs) — teacher
    announcements, weekly recap, challenge updates.
  - `@capacitor/filesystem` — offline audio of recordings; background audio playback.
  - Secure storage (Keychain/Keystore) for the session token.
- **Auth in native:** Better Auth bearer-token mode (session token in secure storage);
  the web keeps httpOnly same-origin cookies. Deep links (`/join/<code>`, magic-link return)
  via Universal Links / App Links.
- **Web PWA remains first-class** and gets **Web Push (VAPID)** for installed PWAs and
  desktop browsers.
- Store readiness: in-app account deletion (already in F1), privacy labels, age rating;
  if Google sign-in is offered, check App Store guideline 4.8 (privacy-preserving login option).
- Release cadence: web ships continuously; store builds monthly or on native changes. Content
  and most UI changes reach apps without store review because the app loads the bundled web
  build and then updates content bundles (ADR-0014).

## Alternatives

- React Native / Flutter rewrite: better native feel, but a second codebase for a small team.
- PWA only: zero store overhead, but weaker reminders on iOS and lower discoverability.

## Consequences

Store accounts (Apple $99/year, Google $25 once), a Mac (or CI macOS runner) for iOS builds,
and a Firebase project for FCM. Engagement features rely on the notification abstraction
(`Notifier`: web-push | fcm | local) rather than a specific channel.

## Implementation (Sprint 13)

- **Where:** the shell is `mobile/` (Capacitor 8 configuration and build notes), kept outside
  the npm workspaces so CI and server images never install native tooling. The web side is
  `apps/web/src/native/`; plugins are reached through `window.Capacitor.Plugins` at run time,
  so the web bundle has no native dependency and behaves as the PWA in a browser.
- **Auth:** Better Auth's `bearer` plugin with `requireSignature` — the app only ever holds
  the signed token the server issued in `set-auth-token`. The app fetch sends `/api/…` and
  `/media/…` to `VITE_SUFFA_API_ORIGIN`, with `credentials: 'omit'` and the bearer header on
  API calls only; a 401 or a sign-out forgets the token. The token is stored with
  `capacitor-secure-storage-plugin` (Keychain / Keystore), falling back to Preferences.
- **CORS:** only `SUFFA_APP_ORIGINS` (default `capacitor://localhost,https://localhost`),
  without credentials; the same-origin write guard accepts these origins too. Cookies are
  never accepted cross-origin, so the web's CSRF stance is unchanged.
- **Links:** the API serves `/.well-known/apple-app-site-association` and
  `/.well-known/assetlinks.json` from `SUFFA_IOS_APP_IDS` / `SUFFA_ANDROID_APP_LINKS` for the
  sign-in path and `/join/*`. The app verifies the magic link itself, without the callback,
  and then opens the in-app page the callback named (never another origin).
- **Notifications:** the `Notifier` is a router: `fcm:<token>` devices go to FCM HTTP v1
  (service-account JWT from `SUFFA_FCM_SERVICE_ACCOUNT`), all others to web push, so
  reminders, recaps and dead-device clean-up are shared. Without FCM on the server the app
  plans the daily reminder on the device, a week ahead, skipping today once something was
  learned; `appPush` in `GET /notifications` tells the app which applies.
- **Audio:** offline copies stay in IndexedDB (works in the web view); lock-screen controls
  through the Media Session API. Background audio needs the iOS `audio` background mode
  (see `mobile/README.md`).
