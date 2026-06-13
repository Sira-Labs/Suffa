# ADR-0002: Offline-first Sync mit Last-Write-Wins

- Status: akzeptiert
- Datum: 2026-06-13

## Kontext

Der Lernstand muss über mehrere Geräte (Handy + Desktop) eines Nutzers
abgleichbar sein, während die App **offline** voll funktioniert. Echte
gleichzeitige Bearbeitung desselben Datensatzes auf zwei Geräten ist selten.

## Entscheidung

- **IndexedDB (Dexie) ist die Single Source of Truth** auf dem Gerät. Die UI
  liest/schreibt ausschließlich lokal.
- Jeder synchronisierbare Datensatz trägt `id` (UUID bzw. deterministische ID),
  `updated_at` (ISO) und `deleted` (Soft-Delete-Tombstone).
- **Persistente Mutation-Queue (Outbox)**: jede lokale Schreiboperation legt
  einen Outbox-Eintrag an. Ein Sync-Zyklus macht **push → pull → reconcile**.
- **Konfliktlösung: Last-Write-Wins pro Datensatz** über `updated_at`
  (`src/services/sync/reconcile.ts`). Ganzer Datensatz gewinnt, kein Feld-Merge.
- Soft-Deletes nehmen als normaler Datensatz am LWW teil (eine neuere Bearbeitung
  kann eine ältere Löschung überstimmen und umgekehrt).
- Schlägt push/pull fehl, bleibt die Outbox erhalten → kein Datenverlust, der
  nächste Zyklus versucht es erneut.

## Begründung der deterministischen Karten-IDs

SRS-Karten erhalten die ID `kind:contentRef` (z. B. `vocab_ar_de:v-ism`). Legen
zwei Geräte vor dem ersten Sync dieselbe logische Karte an, teilen sie sich die
ID und werden per LWW zusammengeführt statt dupliziert. Da diese IDs nur **pro
Nutzer** eindeutig sind, ist der Primärschlüssel im Backend `(user_id, id)` und
der Upsert nutzt `onConflict='user_id,id'`.

## Alternativen

- **CRDTs / operationales Merge**: robuster bei echter Nebenläufigkeit, aber
  deutlich komplexer. Für persönliche Lerndaten überdimensioniert.

## Konsequenzen

Einfache, vorhersagbare Semantik. Theoretischer Nachteil: bei echter
gleichzeitiger Bearbeitung kann eine Änderung verloren gehen (die ältere). Für
Einzelnutzer-Lerndaten akzeptabel.
