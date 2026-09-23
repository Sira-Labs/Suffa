# ADR-0019: App-store apps with Capacitor; push and local notifications

- Status: proposed
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
