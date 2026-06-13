# ADR-0001: SRS-Engine im SM-2-Stil mit 4-Stufen-Bewertung

- Status: akzeptiert
- Datum: 2026-06-13

## Kontext

Kern der App ist Spaced Repetition. Wir brauchen ein Scheduling, das offline und
deterministisch rechnet, gut verstanden ist und sich testen lässt.

## Entscheidung

Wir implementieren eine SM-2-Variante (`src/services/srs/engine.ts`):

- **4-stufige Bewertung** (`again`/`hard`/`good`/`easy`) statt der klassischen
  0–5-Skala – näher an Anki/FSRS und passend zu den UI-Buttons.
- **Lernphase mit festen Intervallen**: erste erfolgreiche Wiederholung 1 Tag,
  zweite 6 Tage, danach `Intervall × Ease`.
- **Ease** startet bei 2.5, Minimum 1.3; Anpassung pro Bewertung.
- **`again` ist ein Lapse**: Reps-Reset, Ease-Strafe, erneute Fälligkeit;
  ab `LEECH_LAPSE_THRESHOLD` Lapses wird die Karte als **Leech** markiert
  (automatisches Fehlerprotokoll → „Schwierige Wörter“).
- Reine Funktionen (kein I/O) → vollständig unit-testbar (`srs.test.ts`).

## Alternativen

- **FSRS** (moderner, genauer): höhere Komplexität, mehr Parameter, schwerer
  nachvollziehbar. Für Buch 1 ist SM-2 ausreichend; ein späterer Wechsel ist
  hinter dem `schedule()`-Interface lokal möglich.

## Konsequenzen

Vorhersagbares, erklärbares Verhalten; Intervall-Vorschau pro Button möglich.
Etwas weniger optimal als FSRS bei sehr großen Decks – für den Lehrwerk-Umfang
unerheblich.
