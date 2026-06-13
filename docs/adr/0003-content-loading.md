# ADR-0003: Statische Lehrinhalte als versioniertes JSON mit Glob-Loader

- Status: akzeptiert
- Datum: 2026-06-13

## Kontext

Die Lehrinhalte (Vokabeln, Dialoge, Verben …) stammen aus „العربية بين يديك“
Buch 1 und sind je Einheit organisiert. Sie sollen **nicht** synchronisiert
werden (sie sind für alle Nutzer gleich, nur referenziert) und neue Einheiten
sollen **ohne Code-Änderung** hinzukommen.

## Entscheidung

- Globale Inhalte (Meta, Quellen, Nisba, Verben, Minimalpaare) liegen in
  `src/content/meta.json`.
- Pro Einheit eine Datei `src/content/units/einheit-NN.json` (Vokabeln + Dialoge).
- `src/content/index.ts` lädt alle Unit-Dateien per `import.meta.glob(..., { eager })`
  und führt sie zusammen. Eine neue Datei wird beim Build automatisch erfasst.
- `contentVersion` in der Meta versioniert den Stand.
- Jede Vokabel/Verb/… hat eine stabile fachliche `id`, auf die SRS-Karten per
  `contentRef` zeigen.

## Konsequenzen

Redakteure ergänzen Inhalte rein durch JSON. Die App bündelt alle Inhalte zur
Build-Zeit → vollständig offline verfügbar. Nachteil: Inhaltsänderungen erfordern
ein Re-Deploy (akzeptabel; das „Inhalt hinzufügen“-Formular deckt nutzereigene
Vokabeln zur Laufzeit ab und synct diese).
