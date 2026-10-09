# Pronunciation eval with pilot recordings (story 15.5)

How we find out whether Suffa's pronunciation feedback agrees with a teacher, before choosing
a phoneme assessor (ADR-0022 §4). The harness runs today on an own fixture set; the pilot in
January adds real, consented recordings.

## What is measured

| Metric                                 | Meaning                                                                                                                        | Target (ADR-0022)    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------- |
| Spearman ρ                             | Do Suffa's scores order the recordings like the teacher's ratings (1–5)?                                                       | as high as possible  |
| Wrong letters: precision / recall / F1 | Letters Suffa did not accept (wrong or "check") against the letters the teacher marked wrong.                                  | as high as possible  |
| False rejections                       | Recordings the teacher accepted (rating 4–5, no letter marked) where Suffa still called a letter wrong. Hurts motivation most. | at most 5 %          |
| Latency p95                            | Recogniser plus rating, per recording.                                                                                         | at most 3 s per word |
| Cost per minute                        | What the recogniser charges per minute of audio (list price set for the run).                                                  | report               |

## Collecting the data (pilot, January)

1. **Consent first.** Only recordings a learner explicitly donated for the evaluation, with
   parents' consent for minors (ADR-0022 §6). Recordings shared with the teacher (story 15.4)
   are _not_ eval data unless donated as well.
2. **The teacher rates each recording**: a rating from 1 (unintelligible) to 5 (as the teacher
   would say it), and the letters that were wrong. 30–50 recordings per assessor are enough
   for a first comparison; include good readings too, so false rejections can be counted.
3. **The data set** is one folder outside the repository (private storage, deleted after the
   evaluation): the recordings and a `set.json`:

```json
{
  "cases": [
    {
      "id": "p01-unit3-line2",
      "text": "<the vocalised sentence the learner read>",
      "audio": "p01-unit3-line2.m4a",
      "durationSeconds": 3.2,
      "teacher": {
        "rating": 3,
        "wrong": [{ "letter": "ع" }, { "letter": "ح", "nth": 2 }]
      }
    }
  ]
}
```

`wrong` names each letter and which occurrence in the text it is (`nth`, default 1). Audio:
webm, ogg, m4a/mp4, mp3, wav or aac.

## Running it

```bash
npm run build -w @suffa/api
# Fixture set (stored transcripts, no cost) – also part of CI:
npm run eval:pronunciation -w @suffa/api
# Pilot data through the speech recogniser (EU, as on the server):
SUFFA_TRANSCRIBE_URL=https://api.mistral.ai/v1/audio/transcriptions \
SUFFA_MISTRAL_API_KEY=… \
SUFFA_EVAL_STT_USD_PER_MINUTE=<list price> \
npm run eval:pronunciation -w @suffa/api -- /path/to/pilot/set.json
```

The run prints a Markdown table and fails when it misses
`apps/api/evals/pronunciation/baseline.json`. A phoneme assessor (ADR-0022) plugs in as
another `PronunciationAssessor` and runs over the same data; the one with the fewest false
rejections at a comparable F1 wins.
