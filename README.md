# Al-Arabiyya bayna Yadayk — Lerntrainer (PWA)

Eine **offline-first Progressive Web App** zum Erlernen von Hocharabisch (MSA /
فصحى) nach dem Lehrwerk **„العربية بين يديك“ (Al-Arabiyya bayna Yadayk), Buch 1**.
Mit Spaced Repetition, Wurzel-/Morphologie-Training, vollständiger Vokalisierung
(Tashkīl) und **Synchronisation des Lernstands über mehrere Geräte** (Handy +
Desktop) per Benutzerkonto.

> UI auf Deutsch · Lerninhalte arabisch mit Tashkīl · respektvoll & kultursensibel
> (saudischer Kontext, MSA).

## Highlights

- **Offline-first**: vollständig ohne Netz lernbar; installierbar als PWA
  (Service Worker via `vite-plugin-pwa`/Workbox). Nur externe Audio-/Video-Streams
  brauchen Internet.
- **Lokaler Speicher**: IndexedDB (Dexie) als Single Source of Truth.
- **Geräte-Sync**: persistente Mutation-Queue, Last-Write-Wins, Supabase-Backend
  (Magic-Link-Login, Row-Level-Security). Backend ist über ein `SyncProvider`-
  Interface austauschbar; ohne Konfiguration läuft die App rein offline.
- **Lernmodule**: Dashboard, Vokabeltrainer (SRS), Wurzel-Explorer, Lesen,
  Schreiben, Sprechen, Konjugation, Quellenbibliothek und ein umfangreicher
  Prüfungsmodus (interleaved, gemischte Kapitelprüfung, Speed-Round, adaptiv).

## Tech-Stack

Vite · React 18 · TypeScript (strict) · Dexie (IndexedDB) · Zustand · Supabase ·
Recharts · vite-plugin-pwa (Workbox) · Vitest + Testing Library · ESLint + Prettier.

## Schnellstart

```bash
npm install
npm run dev        # Entwicklung (http://localhost:5173)
```

Die App ist **sofort nutzbar** – ohne Backend läuft sie im reinen Offline-Modus
(NoopSyncProvider). Für die Geräte-Synchronisation richte Supabase ein (s. u.).

### Skripte

| Befehl                  | Zweck                                     |
| ----------------------- | ----------------------------------------- |
| `npm run dev`           | Dev-Server                                |
| `npm run build`         | Typecheck + Produktions-Build (inkl. PWA) |
| `npm run preview`       | Build lokal ausliefern (PWA testen)       |
| `npm run typecheck`     | TypeScript prüfen                         |
| `npm run lint`          | ESLint                                    |
| `npm run format`        | Prettier schreiben                        |
| `npm test`              | Vitest (einmalig)                         |
| `npm run test:coverage` | Tests mit Coverage                        |

## Supabase einrichten (für Sync)

1. Projekt auf [supabase.com](https://supabase.com) anlegen.
2. **SQL Editor** öffnen und nacheinander ausführen:
   - `supabase/schema.sql` (Tabellen)
   - `supabase/policies.sql` (Row-Level-Security)
3. **Authentication → Providers → Email**: „Magic Link“ aktivieren. Unter
   **URL Configuration** die App-URL als Redirect erlauben (z. B.
   `http://localhost:5173`).
4. `.env` anlegen (aus Vorlage) und Werte aus **Project Settings → API** setzen:

```bash
cp .env.example .env
# VITE_SUPABASE_URL und VITE_SUPABASE_ANON_KEY eintragen
```

5. App starten, unter **Einstellungen → Konto** per Magic-Link anmelden. Dasselbe
   Konto auf Handy und Desktop ⇒ automatischer Abgleich.

> Secrets: Es liegen **keine** Secrets im Code. URL/Anon-Key kommen aus `.env`
> (in `.gitignore`). Der Anon-Key ist clientseitig öffentlich; die Datensicherheit
> stellen die RLS-Policies (`user_id = auth.uid()`) sicher.

## Wie der Sync funktioniert (Kurzfassung)

Alle Lese-/Schreibzugriffe gehen **zuerst** auf IndexedDB. Jede Änderung landet in
einer persistenten **Outbox**. Ein Sync-Zyklus macht **push → pull → reconcile**;
Konflikte werden per **Last-Write-Wins** über `updated_at` gelöst. Schlägt der
Sync fehl (offline), bleibt die Outbox erhalten und wird später erneut versucht.
Statische Lehrinhalte werden **nicht** gesynct, nur referenziert. Details in
`docs/adr/0002-sync-last-write-wins.md`.

## Projektstruktur

```
src/
  components/   wiederverwendbare UI (ArabicText, TashkilToggle, ArabicKeyboard …)
  modules/      Features (dashboard, vocab, roots, reading, writing, speaking,
                conjugation, exam, library, settings)
  services/
    srs/        SRS-Engine + Tashkīl-Toleranz + Deck/Resolver (+ srs.test.ts)
    storage/    Dexie-Schema + Repositories (+ Outbox)
    sync/       SyncProvider-Interface, Supabase-/Noop-Provider, reconcile, engine
    speech/     TTS (SpeechSynthesis) + Recognition (ar-SA)
    audio/      MediaRecorder
  state/        Zustand-Stores (settings, srs, sync, content)
  content/      versioniertes JSON pro Einheit + Loader
  types/        zentrale TypeScript-Typen
  styles/       globales CSS + Fonts
tests/          Integrationstests (Sync-Engine, Vokabelmodul)
supabase/       schema.sql + policies.sql
docs/           ADRs + Didaktik-Notizen
```

## Arabische Schriften (offline)

Für hochwertige Typografie lege `amiri.woff2` und `scheherazade.woff2` in
`public/fonts/` ab (OFL-Lizenz, s. `public/fonts/README.md`). Fehlen sie, fällt
die App automatisch auf eine System-Serifenschrift zurück – kein Build-Fehler.

## Inhalte erweitern

- **Neue Einheit**: einfach `src/content/units/einheit-NN.json` anlegen (gleiches
  Schema). Der Glob-Loader erfasst sie automatisch – kein Code nötig (ADR-0003).
- **Eigene Vokabeln zur Laufzeit**: im Vokabeltrainer „+ Inhalt hinzufügen“. Diese
  werden synchronisiert und erzeugen automatisch SRS-Karten.

## Tests

```bash
npm test
```

Enthält u. a. Pflicht-Unit-Tests für die **SRS-Engine**
(`src/services/srs/srs.test.ts`) und die **Sync-Reconciliation**
(`src/services/sync/reconcile.test.ts`) sowie Integrationstests für die
**Sync-Engine** und das **Vokabelmodul** (`tests/`).

## Beitrag & Commits

Empfohlen: **Conventional Commits** (`feat:`, `fix:`, `docs:`, `test:`, `chore:`).
Vor dem Commit: `npm run lint && npm run typecheck && npm test`.

## Lizenz

Code: MIT (siehe `LICENSE`). Lehrwerksinhalte „العربية بين يديك“ unterliegen dem
Urheberrecht der jeweiligen Rechteinhaber; die Seed-Daten dienen Lern-/Demozwecken.
