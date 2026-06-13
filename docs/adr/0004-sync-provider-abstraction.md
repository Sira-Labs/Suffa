# ADR-0004: Austauschbares Sync-Backend über SyncProvider-Interface

- Status: akzeptiert
- Datum: 2026-06-13

## Kontext

Heute nutzen wir Supabase (Auth + Postgres + RLS). Aus Gründen der Datenhoheit
könnte später ein selbst gehostetes Backend (z. B. PocketBase) gewünscht sein.
Außerdem muss die App ganz ohne Backend (reiner Offline-Betrieb) laufen.

## Entscheidung

- Ein **`SyncProvider`-Interface** (`src/services/sync/provider.ts`) kapselt
  Auth (Magic-Link), `push` und `pull`. Fehler werden als `Result<T>`
  zurückgegeben (kein blindes `catch`-all).
- Konkrete Implementierungen:
  - **`SupabaseSyncProvider`** – produktiv, gegen Supabase.
  - **`NoopSyncProvider`** – reiner Offline-Betrieb ohne Login.
- Eine **Factory** (`factory.ts`) wählt anhand der `.env`-Konfiguration den
  Provider. Fehlt die Konfiguration oder ist `VITE_SYNC_ENABLED=false`, wird der
  Noop-Provider verwendet.
- Die `SyncEngine` ist providerunabhängig (Dependency Injection im Konstruktor).

## Konsequenzen

Backend-Wechsel = neue Provider-Klasse, kein Eingriff in Engine/Stores/UI.
Die App ist ohne jede Konfiguration sofort offline nutzbar; „Anmelden &
hochladen“ wird durch späteres Setzen eines echten Providers möglich.
