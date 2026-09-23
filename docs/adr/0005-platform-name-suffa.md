# ADR-0005: Platform name "Suffa" and AI persona "al-Muʿallim"

- Status: proposed
- Date: 2026-09-23

## Context

The app is growing from a single-book trainer ("Al-Arabiyya bayna Yadayk – Lerntrainer") into a
multi-role learning platform. It needs a name drawn from the Sīra that expresses learning in
community, and a name for the AI teacher.

## Decision

- Platform: **Suffa (الصُّفَّة)** — the platform in the Prophet's ﷺ mosque where the Ahl al-Ṣuffa
  lived and studied; widely regarded as the first residential place of learning in Islam.
- AI teacher: **al-Muʿallim (المُعَلِّم)** — a role, not a person.
- The AI is **never** named after, or made to speak as, a Companion or any real scholar.
- The package name and repo stay unchanged until the monorepo move (ADR-0006); then
  `@suffa/*` package scope.

## Alternatives

- _Dār al-Arqam_ — historically apt (first teaching house in Makka), longer and harder to brand.
- _Zayd_ / _Muṣʿab_ as AI persona — strong stories, rejected: attributing generated text to a
  Companion is disrespectful and misleading.

## Consequences

Clear, respectful identity; persona rules are part of the tutor system prompt and eval set.
