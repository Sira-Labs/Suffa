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

The iOS project (`ios/`, Swift Package Manager, no CocoaPods) is committed; Android is added
with `npx cap add android` when it is needed.

```bash
cd mobile
npm ci
export VITE_SUFFA_API_ORIGIN=https://suffa.siralabs.org   # the server this build talks to
npm run sync                                              # web build + copy into the shells
npm run open:ios                                          # Xcode: run on a connected iPhone
```

Place the Firebase files from the Firebase console (not committed):
`android/app/google-services.json` and `ios/App/App/GoogleService-Info.plist`.

## iOS: TestFlight from GitHub Actions

The `ios-testflight` workflow (Actions → ios-testflight → Run workflow, on `main`) builds the
app on a macOS runner and uploads it to TestFlight. Signing is automatic with an App Store
Connect API key: no certificates or profiles to manage. Version = latest release tag, build
number = the run number.

One-time setup (account holder):

1. developer.apple.com → Certificates, Identifiers & Profiles → Identifiers → **+** → App IDs →
   App, bundle id `org.siralabs.suffa` (explicit), capability **Associated Domains**.
2. appstoreconnect.apple.com → Apps → **+** → New App: iOS, name "Suffa", primary language
   German, bundle id `org.siralabs.suffa`, SKU `suffa`.
3. App Store Connect → Users and Access → Integrations → App Store Connect API → generate a
   key with the **Admin** role (cloud signing needs it); download the `.p8` once.
4. GitHub → repository → Settings → Secrets and variables → Actions → new repository secrets:
   `APP_STORE_CONNECT_KEY_ID`, `APP_STORE_CONNECT_ISSUER_ID`, `APP_STORE_CONNECT_KEY_P8` (the
   whole file content) and `APPLE_TEAM_ID` (Membership details).
5. Server (CapRover, staging): `SUFFA_IOS_APP_IDS=<TEAMID>.org.siralabs.suffa`, so magic links
   and invitations open the app (Universal Links).
6. Run the workflow; after Apple's processing the build appears under TestFlight → add an
   internal testing group with your Apple ID → install it with the TestFlight app on the iPhone.

A Mac with Xcode stays useful for debugging: run the app on a cable-connected iPhone and inspect
the web view with Safari → Develop → (iPhone) → Suffa.

Push on iOS (FCM through APNs) is a later step: it needs an APNs key in Firebase, the Firebase
Messaging SDK and the Push Notifications capability. Until then the app plans the daily
reminder on the device.

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
