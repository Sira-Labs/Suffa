# Didaktik-Notizen

Wie die lernwissenschaftlichen Prinzipien in der App umgesetzt sind.

## Allgemeine Prinzipien

| Prinzip                               | Umsetzung                                                                                                 |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Spaced Repetition                     | `services/srs/engine.ts` (SM-2), tägliche Queue `queue.ts`                                                |
| Active Recall vor Recognition         | `RecallInput` (Produktion ist Standard); Multiple-Choice nur als markiertes „Stützrad“ in `ReviewSession` |
| Comprehensible Input (i+1)            | Lesen-Modul: vokalisierte Texte, Tap-a-Word-Glosse, Übersetzung zuschaltbar                               |
| Pushed Output                         | Schreiben- und Sprechen-Module sind Pflichtproduktion (Diktat, Übersetzung, Shadowing, Aufnahme)          |
| Interleaving                          | `queue.ts` (`interleaveByKind`) und `exam/examEngine.ts` mischen Formate                                  |
| Spaced Retrieval Alt+Neu              | `buildQueue` streut neue Karten zwischen fällige Wiederholungen                                           |
| Sofortiges, spezifisches Feedback     | `Feedback`-Komponente mit Zeichen-Diff und Begründung                                                     |
| Deliberate Practice + Fehlerprotokoll | Leech-Markierung (`engine.ts`); falsche Prüfungs-Items → SRS sofort fällig                                |
| Metakognition                         | Dashboard: Beherrschung, Vergessenskurve, Streak, Heatmap, „Was als Nächstes“                             |

## Arabisch-spezifische Prinzipien

- **Wurzel & Muster (الجذر والوزن)** als Rückgrat: jede Vokabel trägt `wurzel`
  und `wazn`; der **Wurzel-Explorer** (`modules/roots`) vernetzt Ableitungen und
  bietet die Übung „Gleiche Wurzel?“. Eigener Kartentyp `root_to_word`.
- **Tashkīl-Stufen** (voll → teilweise → ohne): `TashkilToggle` + `ArabicText`
  (`applyTashkilLevel`). Recall-Eingaben sind tashkīl-tolerant (`tashkil.ts`).
- **Phonologie-Drills** mit Minimalpaaren (ء ع ح خ … ): `MinimalPairDrill`
  (Hör-Diskriminierung) + Aussprache-Scoring im Sprechen-Modul.
- **Diglossie**: Stoff ist als فصحى (MSA) gekennzeichnet (`meta.register`);
  optionale Golf-Dialekt-Randnotizen sind als nicht prüfungsrelevant markiert
  (Einstellung `dialectNotes`).
- **Kulturnotizen** je Einheit (`kulturnotiz` in den Unit-JSONs), respektvoll und
  im saudischen Kontext (z. B. Begrüßungsformeln, „الحمد لله“).

## Bewertungs-Mapping (SM-2)

| Button | Bedeutung       | Wirkung                                 |
| ------ | --------------- | --------------------------------------- |
| Wieder | nicht erinnert  | Lapse: Reset + Ease −0.2, sofort erneut |
| Schwer | mühsam erinnert | Ease −0.15, kleineres Intervall (×1.2)  |
| Gut    | erinnert        | Ease unverändert, Intervall × Ease      |
| Leicht | mühelos         | Ease +0.15, Intervall × Ease × 1.3      |
