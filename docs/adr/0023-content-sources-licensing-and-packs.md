# ADR-0023: Content sources, licensing and content packs

- Status: proposed
- Date: 2026-09-23
- Amends: ADR-0003 (content loading), ADR-0014 (content CMS and offline bundles)

## Context

Suffa follows _Al-Arabiyya bayna Yadayk_ (العربية بين يديك). Its dialogues, reading texts,
exercises and audio are copyrighted by the publisher. Today three demo units live in the
**public** repository as JSON. Growing to all 16 units of Book 1 (and later Books 2–3) means
thousands of items, and most of the useful material is either copyrighted or written by the
teacher for his class.

We need to grow content fast without publishing material we have no right to publish, and
without losing offline use.

## Decision

1. **Two tiers of content, one format.**
   - **Open content** (in the public repo, bundled with the PWA): material we write ourselves or
     that has an open licence (e.g. Tatoeba sentences CC BY 2.0 FR, Wiktionary CC BY-SA,
     our own example sentences, the alphabet and pronunciation course). Each item carries a
     `source` and `licence` field.
   - **Class content** (never in the repo): book-aligned dialogues and readings the teacher
     adapts or writes, his recordings, anything licensed. Stored in Postgres/RustFS, delivered
     only to signed-in members of classes that are entitled to the pack.
2. **Content packs.** Content is grouped into packs (`book1-unit-04`, `alphabet`,
   `numbers-and-time`, `teacher-<class>-week-12` …). A pack is versioned and immutable once
   published (ADR-0014) and downloadable for offline use. The PWA keeps bundling open packs.
3. **Vocabulary lists are facts, texts are not.** Word lists that follow the book's order,
   with our own meanings, roots, patterns and example sentences, are open content. Book
   dialogues and reading texts are not copied; the teacher writes his own dialogues on the same
   topic and vocabulary (class content), or links to the publisher's official audio.
4. **Stable ids.** Every item keeps a stable id derived from root + lemma (existing rule), so
   SRS cards survive content updates. Ids are never reused.
5. **English schema.** Content schema v2 uses English field names (`unit`, `root`, `pattern`,
   `meanings: { de, en }`), matching ADR-0021; a loader maps v1 files until they are migrated.

## Alternatives

- Put everything in the repo: fastest, but would publish copyrighted texts.
- Make the repo private: hides the problem instead of solving it, and blocks open-source reuse.
- Ask the publisher for a licence first: worth doing (we note it as an open action), but the
  plan must not depend on it.

## Consequences

- Content authoring moves from developers to the teacher and editors → the CMS (ADR-0014) is
  needed before the pilot, in a lean form (see `docs/plan/content-plan.md`).
- Entitlements per class are needed (built on RBAC, ADR-0009).
- A validator becomes part of CI for open packs and of publishing for class packs.
- This is not legal advice; before the pilot we ask the teacher which book materials his
  school has licensed and write to the publisher about a classroom licence.
