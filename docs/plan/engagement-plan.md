# Suffa — Engagement Plan (daily & weekly achievements, teacher pilot)

- Date: 2026-09-24 · Decision record: ADR-0016 · Delivery: Sprints 5–6 (core), 13–14 (apps, leagues)
- Audience: the pilot teacher and his students; applies to every class afterwards.

## 1. Principles

1. **Reward learning, not tapping.** XP comes from effortful recall, correct answers, spaced
   returns and speaking/writing output. Raw volume is soft-capped per day.
2. **Consistency over intensity.** A famous hadith fits the product well: _"The most beloved
   deeds to Allah are the most consistent, even if small"_ (al-Bukhārī, Muslim). Small daily
   quests beat marathon sessions.
3. **Cooperate first, compete by choice.** Class challenges are shared goals; leaderboards are
   opt-in, weekly, and off by default for minors.
4. **No dark patterns.** No loot boxes or chance rewards (avoids _maysir_), nothing to buy,
   no guilt-trip copy, rest days allowed, max 1 reminder per day, quiet hours respected.
5. **The teacher is the heart.** Tools make the teacher's recognition visible; the app
   amplifies the human relationship, it doesn't replace it.

## 2. The daily loop (≈ 10–15 minutes)

```
Reminder (chosen time) → open app → "Today" card with 3 daily quests
  → review due cards → one new thing (words / recording segment / lesson)
  → one output task (speak or write) → quests done → +bonus XP, streak ✓, tomorrow preview
```

### Daily quests (3 per day, generated per learner)

Picked deterministically from `(userId, date)` and learner state, so they're the same on
every device and computable offline.

| Slot                | Pool (examples)                                                                                                                            | Typical XP |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| **Review** (always) | "Clear your due reviews (N)" · "Review 20 cards with ≥ 80 % correct"                                                                       | 30         |
| **Learn**           | "Learn 5 new words from Unit 3" · "Watch today's recording segment and pass its checkpoints" · "Explore one root family"                   | 25         |
| **Produce**         | "Shadow 3 sentences" · "Write 2 sentences with today's words" · "Conjugate 1 verb in all persons" · later: "Talk 3 turns with al-Muʿallim" | 25         |
| **Bonus**           | all three done                                                                                                                             | +20        |

Teacher assignments with a due date appear as an extra **class quest** (XP set by teacher).

### XP rules (v1)

| Action                                                             | XP                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------ |
| Review, rating good/easy                                           | 2 (hard 1, again 0) — soft cap 150 XP/day from reviews |
| New card learned (first good)                                      | 3                                                      |
| Exam item correct                                                  | 2; perfect exam +15                                    |
| Checkpoint correct in a lesson/recording                           | 3                                                      |
| Audio track heard (≥ 85 % actually played, seeking does not count) | 5 — shipped 2026-09-23                                 |
| All tracks of a lesson heard                                       | +15 bonus — shipped 2026-09-23                         |
| Unit practice item, first success (read, write, speak, verbs)      | 2 — shipped 2026-09-23                                 |
| Unit test passed by the unit's target date                         | +50 — shipped 2026-09-23 (late only loses this bonus)  |
| Stage test passed (units 1–8 or 9–16 of a book)                    | +250 — shipped 2026-09-24, with milestone screen       |
| Daily check-in with the word of the day (once per local day)       | +10 — shipped 2026-09-24 (`daily_checkins`, local)     |
| Writing/speaking task submitted                                    | 10 (+5 if AI/teacher grade ≥ 80 %)                     |
| Daily quest completed                                              | per table above                                        |

Shipped so far (2026-09-23): review and listening XP computed on the device
(`apps/web/src/services/engagement/xp.ts`), weekly XP on "Heute", a "+XP" celebration for heard
tracks and lessons. Listening progress is stored locally (`media_progress`) and joins sync with
the engagement sprint, as do unit practice (`practice_progress`) and started units with pace and
target date (`unit_enrollments`). Deadlines are soft: an overdue unit stays open, can be
extended once by 7 days, and only loses the on-time bonus; the next unit opens with the unit
test (≥ 80 %). The forgetting curve appears only after a break (streak broken), not as a
permanent panel.

**Levels** follow a gentle curve (`level n` needs `50·n^1.5` XP total). Separately, a
**mastery ring per unit** shows the percentage of the unit's items with mature cards (≥ 21 d);
this is the true progress measure and what certificates are based on.

## 3. The weekly loop

| Element                    | How it works                                                                                                                                                                     |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Weekly goal (personal)** | Learner picks 3, 5 or 7 active days/week. Meeting it keeps the **weekly streak**. Missing a day never "breaks" the week if the goal is met.                                      |
| **Daily streak**           | Days with ≥ 1 completed quest. Day boundary in **the learner's time zone** (fixes today's UTC logic).                                                                            |
| **Streak shields**         | Earn 1 per 7 consecutive days (max 2); auto-used on a missed day.                                                                                                                |
| **Class weekly challenge** | Teacher sets a cooperative target on Monday (e.g. "2,000 reviews as a class", "everyone finishes Recording 4"). Shared progress bar; if reached, everyone gets the week's badge. |
| **Weekly recap** (Sunday)  | Personal card: words matured, minutes, best day, badges; class card: challenge result, teacher shout-outs. Push + in-app.                                                        |
| **League (opt-in, S14)**   | Weekly class ranking by % of personal weekly goal achieved (not raw XP), so beginners can win; resets weekly. Top 3 get a weekly title, nobody is shown as "last".               |

## 4. Achievements catalogue (v1, ~30 badges)

Names use Arabic learning vocabulary with German/English subtitles. Tiers: bronze · silver · gold.

| Category    | Badge (tiers)                               | Condition                                                          |
| ----------- | ------------------------------------------- | ------------------------------------------------------------------ |
| Consistency | **al-Mudāwim** المُداوِم — "the steady one" | 7 · 30 · 100-day streak                                            |
| Consistency | **Ṭālib al-ʿIlm** طالِبُ العِلم             | 4 · 12 · 26 weekly goals met                                       |
| Consistency | **Early bird** (بُكور)                      | 10 sessions before 08:00 local                                     |
| Vocabulary  | **Ḥāfiẓ al-Kalimāt** حافِظ الكلمات          | 100 · 500 · 1,000 mature words                                     |
| Roots       | **al-Jadhr** الجَذر                         | 10 · 25 · 50 root families explored with ≥ 3 mature words          |
| Grammar     | **al-Mutaṣarrif** المُتَصَرِّف              | all persons correct for 5 · 15 · 30 verbs                          |
| Writing     | **al-Khaṭṭāṭ** الخَطّاط                     | 25 · 100 · 250 dictations/translations ≥ 80 %                      |
| Speaking    | **al-Mutakallim** المُتَكَلِّم              | 25 · 100 · 250 shadowing items                                     |
| Listening   | **al-Mustamiʿ** المُستَمِع                  | 5 · 20 · 50 recordings/lessons completed with checkpoints          |
| Exams       | **Najm al-Imtiḥān** نَجم الامتحان           | perfect score on a unit exam (per unit)                            |
| Units       | **Unit n complete**                         | ≥ 90 % unit mastery → printable certificate                        |
| Class       | **Rūḥ al-Faṣl** رُوح الفَصل                 | contributed to 1 · 5 · 10 successful class challenges              |
| Teacher     | **Custom badges**                           | created and awarded by the teacher (name, icon, message)           |
| Seasonal    | **Ramaḍān**                                 | 20 active days during Ramadan (goals auto-reduced in Ramadan mode) |

Hidden badges: a few surprise ones (e.g. "revived a leech word 3 times"). Badges are
**never lost**.

## 5. Notifications strategy

| Channel                                   | Used for                                                                       | Rules                                                                     |
| ----------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Local notification (app) / Web Push (PWA) | Daily reminder at the learner's chosen time                                    | Max 1/day; skipped if already done today; quiet hours 22:00–07:00 default |
| Push (server)                             | Teacher announcement, new recording published, challenge reached, weekly recap | Max 3/week non-reminder; teacher messages always delivered                |
| Email                                     | Weekly recap (opt-in), assignment due tomorrow                                 | One digest, unsubscribe link                                              |

Optional **prayer-time-aware quiet windows** (computed on-device from coarse location, opt-in):
no reminder in the 20 minutes after each adhān.

Copy tone: encouraging, short, bilingual touch — e.g. _"٥ دقائق فقط — 5 minutes keep your
streak alive 🌱"_. Never guilt ("You failed…").

## 6. Teacher playbook (weekly rhythm)

| When                    | Teacher action (in app, ≤ 10 min)                                                               | What students see          |
| ----------------------- | ----------------------------------------------------------------------------------------------- | -------------------------- |
| Monday                  | Set the class weekly challenge (one tap from templates)                                         | Challenge card + push      |
| After each live session | Import the recording from Google Drive → publish segment + 3 checkpoints                        | "New session" quest + push |
| Midweek                 | Glance at class dashboard (who is stuck, top leech words); send 1–2 shout-outs or custom badges | Shout-out in feed/push     |
| Friday                  | Optional 10-minute "class quiz" in the live session using the week's leech words (S14+)         | Live quiz                  |
| Sunday (automatic)      | Weekly recap generated; teacher reviews in 2 min                                                | Recap card                 |
| Monthly                 | Award unit certificates; adjust goals                                                           | Certificate PDF            |

## 7. Pilot plan with the teacher

| Step                         | When               | What                                                                                                                      |
| ---------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| 1. Kick-off interview        | S4 (Nov)           | Class size, ages (minors?), devices, session schedule, which recordings, languages. Agree consent process for recordings. |
| 2. Class setup               | end S4             | Teacher account, class, invite link/QR, 3–5 test students.                                                                |
| 3. Engagement v1 soft launch | end S6 (Dec 27)    | Daily quests, badges, class challenge, web push.                                                                          |
| 4. **Pilot start**           | **Mon 2027-01-04** | Whole class onboarded in a live session (10 min, QR code).                                                                |
| 5. Recordings                | S7–S8 (Jan)        | Drive import live; first 5 recordings published with checkpoints.                                                         |
| 6. Check-ins                 | every 2 weeks      | 20-min call with the teacher + 3 student interviews; review metrics below.                                                |
| 7. Review & decide           | end Feb            | Continue/expand; collect testimonial; decide on app-store release timing.                                                 |

## 8. Metrics

| Metric                                   | Target (pilot)              | Guardrail                        |
| ---------------------------------------- | --------------------------- | -------------------------------- |
| Weekly active students / enrolled        | ≥ 70 %                      | —                                |
| DAU/MAU (stickiness)                     | ≥ 35 %                      | —                                |
| D7 / D30 retention                       | ≥ 60 % / ≥ 40 %             | —                                |
| Daily quest completion (active days)     | ≥ 60 %                      | —                                |
| Class challenge success rate             | 60–80 % (too easy if 100 %) | —                                |
| Mature words per active student per week | rising                      | **must not fall while XP rises** |
| Notification opt-out rate                | ≤ 15 %                      | reduce frequency if exceeded     |
| Teacher time per week in app             | ≤ 30 min                    | —                                |

With a class of ~20–30 students, A/B tests are not statistically meaningful; we use
before/after comparisons, per-feature flags, and interviews. Proper experiments come once
several classes are active.

## 9. Delivery mapping

| Sprint  | Engagement scope                                                                                                                |
| ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| S5      | `packages/engagement` (XP, quests, achievements, TZ-correct streak, shields), "Today" card, badge gallery, server recompute job |
| S6      | Class dashboard, weekly challenge, teacher badges & shout-outs, Web Push + reminder settings, weekly recap                      |
| S8      | Assignment quests, recording checkpoints count towards quests                                                                   |
| S10     | "Talk with al-Muʿallim" produce-quests                                                                                          |
| S13–S14 | Native local/push notifications, opt-in leagues, certificates, live class quiz                                                  |
