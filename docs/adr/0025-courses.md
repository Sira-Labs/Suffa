# ADR-0025: Courses — parallel textbook streams, one per class

- Status: accepted
- Date: 2026-09-27
- Builds on: ADR-0003 (content loading), ADR-0023 (content sources, licensing and packs)

## Context

Suffa's learning path follows one textbook: _al-ʿArabiyya bayna yadayk_, Book 1, with 16 units.
The owner decided to add a second stream built on the Madinah course (_Durus al-Lughah
al-ʿArabiyyah_ by Dr. V. Abdur Rahim, Book 1 with 23 lessons, later Books 2 and 3). Teachers
choose one of the two for a class; learners without a class choose for themselves.

Today the single book is assumed in many places:

- **Content.** `apps/web/src/content` is one bundle of `einheit-01…16.json`, used as
  module-level singletons by about 30 web modules and loaded again by the API's
  `ContentCatalog`.
- **Stored ids.** They carry a bare unit number and no course:
  - practice records `unit:skill:item`;
  - enrollments `b1-uN`;
  - exam results `units: [n]`;
  - certificates `unit`;
  - class assignments `ref = "n"`.
- **Units, stages and badges.** `packages/engagement/src/units.ts` fixes 16 units and two stages.
- **Hardcoded numbers and names.** "16" and the book's name appear in several screens and in the
  LLM prompts.

Permission from the rights holders of both books has been requested (see
`docs/plan/content-plan.md`). Until it is given, ADR-0023 applies: links, our own word lists
and our own exercises, and no copied book texts or pictures in the repo.

## Decision

1. **A course registry** lives in `packages/engagement/src/courses.ts`, shared by web and API.
   Each course has:
   - an `id`: `bayna-yadayk` or `madinah`;
   - a name and the textbook's title;
   - its unit numbers in learning order;
   - an `available` flag, which says whether classes and learners may choose it yet.
2. **Each course owns a band of unit numbers.**
   - _bayna yadayk_ keeps units 1–16.
   - The Madinah course uses `n01–n99` for Book n, so Book 1 is units 101–123.
   - Unit 0 stays reserved for course-independent practice: the alphabet course and recording
     checkpoints.
   - The limit is `MAX_UNIT = 999`.

   Every id that already contains a unit number therefore stays unique across courses, with no
   new column and no data migration. Nothing stored before this ADR changes meaning.

3. **Learners see numbers inside their course.** `unitLabelNumber(103)` is 3, shown as
   "Lektion 3" in the Madinah course and "Einheit n" in _bayna yadayk_.
4. **Every class follows exactly one course.** The column `classes.course` is added by
   migration 0031; existing classes get `bayna-yadayk`.
   - A teacher picks the course when creating the class. Only `available` courses are accepted.
   - The class list returns the course.
   - Class assignments accept only units of the class's course, because units of another course
     could never count as done there.
5. **Content ids stay unique across courses.** A new course prefixes its own content ids (for
   example `md-` for Madinah vocabulary), so SRS cards and daily check-ins cannot collide with
   _bayna yadayk_ ids, which stay unprefixed. Ids are never reused (ADR-0023).
6. **Unit limits in validators and tables** follow `MAX_UNIT`: certificates, video lessons and the
   tutor routes. Sync already accepted up to 1000.

## Rollout

- **Stage 0 (done):** the registry, `classes.course`, per-course validation of assignments,
  and wider unit limits.
- **Stage 1 (done):**
  - Both courses are offered. A course has an `exercises` flag: only courses with our own
    exercises and a unit test accept unit assignments. The Medina course started without one
    (stage 4 turned it on).
  - The learner's own course is a synced setting, `settings.course` (migration 0032). The
    learning path shows a course switch.
  - A learner on the page of a class that follows another course is offered to switch to it.
    The class does not switch them silently: a learner may be in classes of both courses.
  - Teachers choose the course when they create a class.
  - **The Medina path, Book 1:** 23 lessons (units 101–123). Each lesson opens the book PDF at
    its start page (read from the PDF, `content/courses/madinah/book1.json`) and plays the
    author's recording from archive.org (CSP `media-src` allows `archive.org`). The book's
    solutions, English key, glossary, class notes and video lessons are linked. There is no
    book text in the repo.
- **Stage 2, first part (done):**
  - Each Medina lesson has its own page (`/units/madinah/<n>`). It shows our own content: the
    lesson's new words (facts) with German meanings, grammar in our own words with our own
    examples (`content/courses/madinah/book1-lessons.json`, lessons 1–5, draft).
  - The page also has the author's recording and the lesson's pages of the book, shown one at a
    time as the page images archive.org derives from the identical PDF
    (`madinah_arabic_1_jp2.zip`, `&reduce=2`, about 165 KB a page), loaded from archive.org
    only when opened. Plain images show on every device. Two approaches failed in a real
    browser test: the item's embedded BookReader stays blank for a file in a sub-folder, and
    phone browsers do not show an embedded PDF. archive.org sends no CORS headers, so rendering the
    PDF ourselves is not possible either. CSP `img-src` allows `archive.org` and
    `*.archive.org`; links to the PDF at the page remain.
  - If archive.org cannot deliver a page image, the page says so and points to the PDF links.
  - **The book follows the recording (2026-10-10).** The author's recordings read the book
    aloud, in its order. Playing a lesson's recording opens the book at the lesson; where an
    admin has set the page turns, the book turns its pages with the recording. Flipping by hand
    while it plays stops following until "Buch folgt der Aufnahme" is pressed again. Admins
    tap the page turns along on the lesson page ("Jetzt" while it plays) and save them
    (`PUT /api/v1/book-sync/madinah/1/:lesson`, content:write with second factor, revision
    checked, audit-logged); everyone reads them (`GET /api/v1/book-sync/madinah/1`, public,
    ETag), and the app keeps the last answer for offline use. Only seconds and page
    coordinates are stored (table `book_sync`, migration 0043), no book text. The same record
    has room for line marks: a box on the page image and the seconds it is read.
  - **Line marks (2026-10-10).** Where a lesson's lines are marked, the line being read is
    highlighted on the page (also as `aria-current`), and tapping a line plays the recording
    from there. Admins mark the lines on the lesson page ("Zeilen bearbeiten"):
    - "Zeilen erkennen" finds the text lines on the page image in the admin's browser: bands of
      rows with ink, diacritic bands joined to their line, blocks with a picture beside the
      text split at the rightmost blank column gap, the footer left out. archive.org's images
      and recordings send CORS headers (checked 2026-10-10); its OCR of the Arabic is unusable,
      so no text is read. Text pages come out nearly right; picture pages need a few boxes
      removed or drawn.
    - "Pausen suchen" decodes the recording in the browser and finds the stretches of speech
      between pauses (loudness per 20 ms, a level set by the recording itself).
    - "Zeiten vorschlagen" gives each line of a page one stretch of speech within the page's
      time (between its page turns). "Mittippen" corrects a start: a tap on a line while it
      plays sets its start to the start of the stretch of speech the tap falls into.
    - Only boxes and seconds are saved; lines without a time are not. CSP `connect-src` allows
      `archive.org` and `*.archive.org` for the recording download.
  - **Suggested timings for every lesson (2026-10-10).** `tools/content/madinah-book-sync.mjs`
    computes, for every lesson, where the lines sit and when they are read. The result
    (`content/courses/madinah/book1-sync.json`, only boxes and seconds) is seeded at API start,
    so the book follows the recording from the first day. It is a suggestion: admins correct it
    in the line editor.
    - First version: lines paired with stretches of speech (pauses) in reading order. Wrong in
      practice: the author repeats lines, announces exercises and pauses inside lines, so the
      pairing drifted within the first page.
    - Now (same day): the lines are read and matched with what is said. Pictures are wiped from
      the page before lines are found (they reach into the text's rows), captions side by side
      are lines of their own. Each line is read with Tesseract (Arabic) and the recording's
      words are recognised with Whisper, both on the machine running the tool: no recording or
      book text goes to any service. Both texts are reduced to bare letters and aligned in order
      (`textAlign.mjs`); a line starts when its letters are first said, repeated or announced
      speech matches nothing and is passed over, and boxes never heard (pictures, page numbers)
      are dropped. The OCR text and the recognised words are deleted after the run.
    - Rows the seed wrote are marked `suggested` (migration 0044). A new suggestion replaces
      them at start-up as a new revision; a lesson an admin has saved is never replaced.
  - The same course is sold in print as "Madinah Arabic Reader" by Goodword Books, split into
    8 books (our book 1 = their books 1 and 2). Each lesson names its book and start page in
    that edition, so learners with the printed book find it. We show none of its pages: its
    scans on archive.org carry "© Goodword Books" and no permission, unlike the old edition.
  - A page "Quellen & Lizenzen" (`/sources`) names every source with its terms.
  - Word ids are `md-<unit>-<n>`, so the words can become SRS cards later without new ids.
- **Stage 2, second part (done): practising the words.**
  - A lesson with our own words has a "Wörter üben" station: hear and read a word, choose its
    meaning from four of the lesson. A wrong answer brings the word back at the end of the round.
  - The first right answer is stored as practice (skill `words`, unit = the lesson's unit, item
    = the word id) and earns XP once. The server accepts the new skill; nothing else in the sync
    changes.
  - The words are vocabulary (`madinahVokabeln`) with recognition and recall review cards. A word
    joins the learner's reviews once practised in its lesson, so Medina learners review exactly
    what they met, and bayna yadayk learners get no Medina cards they never saw.
- **Stage 2, third part (done): dictation.** A "Diktat" station reads a word of the lesson aloud
  (or shows it where the browser has no speech output); the learner writes it in Arabic, vowel
  signs optional, graded like the unit writing station. Words not written right come back at the
  end of the round. A word written right is stored once as practice with the existing skill
  `write` under the lesson's unit, so the daily "write" quest counts it and the sync needs no
  change.
- **Stage 2, fourth part (done): gap sentences and a lesson test.**
  - Each lesson with our content has five to seven gap sentences of our own
    (`book1-lessons.json`, `gaps`). Each one trains the lesson's grammar: مَا or مَنْ, نَعَمْ or
    لَا, هٰذَا or ذٰلِكَ, with or without the article, the ending -i after a preposition, and the
    iḍāfa. The German sentence is shown as help. A right answer is stored once as practice
    (skill `cloze`, item `gap-<n>`); a wrong one retries the same sentence.
  - The "Lektionstest" asks up to six meanings (a new random choice on every attempt) and every
    gap sentence, each answered once. It is stored like a unit test: exam format
    `madinah_lesson`, units `[lesson unit]`. It passes from 80 % (`PASS_RATIO`), so
    `passedTest(exams, unit)` already finds it, e.g. for unlocking lessons later.
  - Rounds of words, dictation and the test are shuffled at random (`randomShuffle`).
    `stableShuffle` keeps one order per seed and hardly changes between similar seeds, so it is
    used only where an order must stay the same, such as the options of one question.
- **Stage 2, fifth part (done): all 23 lessons of book 1 have our content.** Lessons 6–23 got
  their words (the words each lesson introduces, read from the book pages: facts), German
  meanings, grammar in our own words with own examples and own gap sentences, so every lesson
  has word practice, dictation, gap text and a lesson test. A word an earlier lesson already
  has is not repeated; the comparison keeps inner vowels and hamza forms, so رَجُلٌ (man) and
  رِجْلٌ (foot) or إِمَامٌ and أَمَامَ stay apart. An independent review of the Arabic found
  six errors, all fixed. The content stays `draft` until a teacher has reviewed it.
- **Stage 3, first part (done): the screens follow the learner's course.** A Medina learner
  sees their own book everywhere:
  - "Heute": the next lesson (the first one whose lesson test is not passed) and "Medina-Kurs ·
    Buch 1" with the lesson tests passed;
  - "Prüfung": the lesson tests with their result, leading to the next one (each lesson is tested
    on its own page);
  - "Hören & Sehen": the author's recording per lesson and the links to the collection and the
    videos;
  - video lessons: only the learner's course, labelled "Lektion n" for Medina units; the video
    admin offers both courses' units;
  - Medina unit numbers (`/units/103`, stations) lead to the lesson page.

  `madinahProgress(exams)` computes the lessons, the tests passed and the next lesson.

- **Stage 3, second part (done): stages, badges and videos per course.**
  - Every stage names its course. The Medina course has two stages in book 1: lessons 1–12,
    badge "Erste Schritte" (الخُطُواتُ الأُولى), and lessons 13–23, badge "Medina Buch 1"
    (كِتابُ المَدِينَةِ الأوَّل). Such a stage has no stage test: it is done when every lesson
    test in it is passed (`stageCompleted`), and it gives the stage XP once.
  - Badge ids and XP references stay `stage-1` and `stage-2` for _bayna yadayk_, so stored
    unlocks keep their meaning; the Medina stages use `madinah-stage-1` and `madinah-stage-2`.
  - The first unit of every course is open.
  - The level card names the running Medina stage and its badge.
  - Every video channel names its course (migration 0033; existing channels keep _bayna
    yadayk_). On import, "Lesson 5" becomes unit 5 or unit 105 by the channel's course, and the
    video admin sets the course.
- **Stage 4 (done): homework and LLM prompts per course.**
  - Every Medina lesson has its lesson test, so the Medina course sets `exercises: true` and
    classes assign its lessons ("Lektion n: Test bestehen"). A passed `madinah_lesson` test
    marks the assignment done, and its link leads straight to the lesson page.
  - The server's content catalog also reads `content/courses/madinah/book1-lessons.json` (the
    API image copies it). A Madinah lesson has its own curriculum pack: the words, grammar and
    filled-in gap sentences.
  - The tutor and the grader name the learner's course (their setting) and say "Lesson n" for
    Madinah units. The learner snapshot finds a Madinah learner's lesson as the first one
    whose test is not passed, because Madinah lessons have no enrolments. Trouble words
    resolve in both courses.
  - The recording prompts (suggestions, proofreading, summary) name the class's course.
- **Stage 4, follow-up (done): daily quests per course.** From `COURSE_QUESTS_SINCE`
  (2026-10-11) a quest can name its courses and a title per course. The dialogue quests
  ("Höre einen Dialog", "Lies einen Dialog") are _bayna yadayk_ only, since Medina lessons have
  no dialogues; Medina learners get "Übe 5 Wörter deiner Lektion" (skill `words`) and the
  wording "Lektion". The video quest needs videos of the learner's course: the public video
  list names each channel's course, and the server asks `coursesWithVideos()`. App and server
  both read the course from the learner's settings, so they pick the same quests. Earlier days
  keep their quests, so no quest done and no XP earned changes. On "Heute" the quests of a
  Medina learner lead to their next lesson's page.
- **Stage 5 and later:**
  - more Madinah exercises, lesson by lesson;
  - the word tools of the tutor (`lookup_vocab`, `get_root_family`) for Madinah words, which
    need roots and transliteration in our own lesson content first.
- **Only with the rights holders' permission:** book exercises and pictures, served from private
  storage and never from the repo.

## Alternatives

- **A `course` column on every progress table.** This is cleaner in theory. It would need a
  data migration of every learner's records, changes to the sync protocol and a new unique key
  in several tables. The number bands give the same uniqueness with none of that.
- **Separate deployments per course.** They would duplicate everything and split classes and
  teachers who use both books.
- **Replacing _bayna yadayk_ with the Madinah course.** Teachers already use _bayna yadayk_; the
  owner wants both streams.

## Consequences

- Code that asks "which course is this unit in" calls `courseOfUnit`; code that lists units
  reads `courseById(id).units`, never a literal range.
- A class cannot switch course while it has unit assignments without losing their meaning. A
  course change for existing classes is left for later, admin-only if ever needed.
- Book 10 of any course would not fit the bands. No course in sight has more than three books.
