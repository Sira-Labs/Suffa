# Suffa app (iOS and Android)

The same web build as the PWA in a [Capacitor](https://capacitorjs.com) shell
([ADR-0019](../docs/adr/0019-mobile-apps-capacitor-push.md)). The folder is outside the
npm workspaces on purpose: CI and the server images never install native tooling; only a
build machine does.

## What the shell adds

| Area        | How                                                                                                                                                                                                    |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sign-in     | Magic link as for the web; the link opens the app (Universal / App Links), the app verifies it and keeps the session as a bearer token in the Keychain / Keystore (`capacitor-secure-storage-plugin`). |
| API         | `/api/…` and `/media/…` go to `VITE_SUFFA_API_ORIGIN` (`apps/web/src/native/`); the server answers CORS only for `SUFFA_APP_ORIGINS`.                                                                  |
| Reminders   | With `SUFFA_FCM_SERVICE_ACCOUNT` on the server: FCM push like web push. Without: the daily reminder is planned on the device (`@capacitor/local-notifications`), a week ahead, quiet hours respected.  |
| Invitations | `https://<host>/join/<code>` opens the app on the invitation page.                                                                                                                                     |

The web code reaches plugins through `window.Capacitor.Plugins` at run time, so the web
bundle has no native dependency and behaves as the PWA in a browser.

## Build

Prerequisites: Node 22, Xcode (iOS, on macOS), Android Studio (Android), a Firebase project
for FCM.

```bash
cd mobile
npm install
export VITE_SUFFA_API_ORIGIN=https://suffa.example.org   # the server this build talks to
npx cap add ios && npx cap add android                   # once; commit the generated projects
npm run sync                                             # web build + copy into the shells
npm run open:ios                                         # or open:android
```

Place the Firebase files from the Firebase console (not committed):
`android/app/google-services.json` and `ios/App/App/GoogleService-Info.plist`.

## Background audio

iOS: in Xcode, _Signing & Capabilities_ → _Background Modes_ → _Audio, AirPlay, and Picture in
Picture_, so class recordings keep playing with the screen locked. Android needs nothing
extra. Lock-screen controls come from the Media Session API in the web code.

## App links

| Platform | In the app project                                                                                                          | On the server                                                                                              |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| iOS      | Capability _Associated Domains_: `applinks:<host>`                                                                          | `SUFFA_IOS_APP_IDS=<TEAMID>.org.siralabs.suffa` → `/.well-known/apple-app-site-association`                |
| Android  | Intent filter with `android:autoVerify="true"` for `https://<host>` and the paths `/api/v1/auth/magic-link/verify`, `/join` | `SUFFA_ANDROID_APP_LINKS=org.siralabs.suffa:<SHA-256 of the signing key>` → `/.well-known/assetlinks.json` |

Android intent filter (in `android/app/src/main/AndroidManifest.xml`, inside the main
activity):

```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="suffa.example.org" android:path="/api/v1/auth/magic-link/verify" />
  <data android:scheme="https" android:host="suffa.example.org" android:pathPrefix="/join/" />
</intent-filter>
```

## Store checklist (PO)

- Apple Developer Program and Google Play Console accounts; bundle id `org.siralabs.suffa`.
- Privacy labels: e-mail (account), learning progress (app functionality); no tracking.
- Account deletion is in the app (Einstellungen → Konto löschen).
- Age rating; TestFlight / internal testing track before release.
