# Didactics notes

How the learning-science principles are implemented in the app. UI labels are quoted in German as
they appear in the app.

## General principles

| Principle                        | Implementation                                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Spaced repetition                | `services/srs/engine.ts` (SM-2), daily queue `queue.ts`                                                                             |
| Active recall before recognition | `RecallInput` (production is the default); multiple choice only as a clearly marked "Stützrad" (training wheels) in `ReviewSession` |
| Comprehensible input (i+1)       | Reading module: vocalised texts, tap-a-word gloss, optional translation                                                             |
| Pushed output                    | Writing and speaking modules require production (dictation, translation, shadowing, recording)                                      |
| Interleaving                     | `queue.ts` (`interleaveByKind`) and `exam/examEngine.ts` mix formats                                                                |
| Spaced retrieval old + new       | `buildQueue` spreads new cards between due reviews                                                                                  |
| Immediate, specific feedback     | `Feedback` component with character diff and explanation                                                                            |
| Deliberate practice + error log  | Leech marking (`engine.ts`); wrong exam items → SRS due immediately                                                                 |
| Metacognition                    | Dashboard: mastery, forgetting curve, streak, heatmap, "Was als Nächstes?" (what next?)                                             |

## Arabic-specific principles

- **Root & pattern (الجذر والوزن)** as the backbone: every vocabulary item carries `wurzel` and
  `wazn`; the **root explorer** (`modules/roots`) links derivations and offers the "Gleiche
  Wurzel?" (same root?) exercise. Dedicated card type `root_to_word`.
- **Tashkīl levels** (full → partial → none): `TashkilToggle` + `ArabicText`
  (`applyTashkilLevel`). Recall input is tashkīl-tolerant (`tashkil.ts`).
- **Phonology drills** with minimal pairs (ء ع ح خ … ): `MinimalPairDrill` (listening
  discrimination) + pronunciation scoring in the speaking module.
- **Diglossia**: material is marked as فصحى (MSA) (`meta.register`); optional Gulf-dialect side
  notes are marked as not exam-relevant (setting `dialectNotes`).
- **Culture notes** per unit (`kulturnotiz` in the unit JSON files), respectful and in the Saudi
  context (e.g. greetings, "الحمد لله").

## Grading mapping (SM-2)

| Button         | Meaning              | Effect                                          |
| -------------- | -------------------- | ----------------------------------------------- |
| Wieder (again) | not recalled         | Lapse: reset + ease −0.2, due again immediately |
| Schwer (hard)  | recalled with effort | Ease −0.15, smaller interval (×1.2)             |
| Gut (good)     | recalled             | Ease unchanged, interval × ease                 |
| Leicht (easy)  | effortless           | Ease +0.15, interval × ease × 1.3               |
