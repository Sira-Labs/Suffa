/**
 * Daily quests (engagement plan §2): three per day, one per slot (review, learn, produce),
 * plus a bonus when all three are done. The quests of a day depend on the day only, so every
 * device and the server show the same ones, offline too. Progress is derived from the day's
 * learning records, so a quest done on the phone is done on the laptop after a sync.
 */
import { DEFAULT_COURSE, type CourseId } from './courses.js';
import { dayKey } from './day.js';
import type { EngagementInput } from './records.js';
import type { XpEvent } from './xp.js';

export type QuestSlot = 'review' | 'learn' | 'produce';

/** What a quest counts on a day. */
export type QuestMetric =
  /** Reviews (any rating). */
  | { kind: 'reviews' }
  /** Reviews rated good or easy; `minRatio` of all of the day's reviews must be correct. */
  | { kind: 'correct'; minRatio: number }
  /** Cards reviewed successfully for the first time ever. */
  | { kind: 'new-cards' }
  /** Audio tracks heard (video lessons count too). */
  | { kind: 'tracks' }
  /** Video lessons watched to the end (tracks with a `yt/` id). */
  | { kind: 'videos' }
  /** Unit practice items; only these skills, or any skill without a list. */
  | { kind: 'practice'; skills?: readonly string[] };

/**
 * What the learner has: features a quest may need (without them it is never picked, e.g. no
 * AI tutor) and the course they follow.
 */
export interface QuestFeatures {
  tutor?: boolean;
  /** The video lesson catalog has lessons (Sprint 12). */
  videos?: boolean;
  /**
   * Courses whose video lessons are in the catalog. From COURSE_QUESTS_SINCE on the video
   * quest needs the learner's course among them (`videos` alone is not enough).
   */
  videoCourses?: readonly CourseId[];
  /** The learner's course (ADR-0025); none means the default course. */
  course?: CourseId | null;
}

export interface QuestDef {
  id: string;
  slot: QuestSlot;
  /**
   * First day (`YYYY-MM-DD`) the quest can be picked. Adding a quest changes which quest the
   * hash picks, so new quests start on a later day and every earlier day keeps its quests (and
   * the XP already earned for them).
   */
  since?: string;
  /** Only picked when this feature is on for the learner. */
  requires?: 'tutor' | 'videos';
  /**
   * Only for learners of these courses, from COURSE_QUESTS_SINCE on: e.g. dialogue quests
   * fit "Al-Arabiyya bayna Yadayk", whose units are built around dialogues.
   */
  courses?: readonly CourseId[];
  /** Learner-facing (German). */
  title: string;
  /** The title for learners of another course, where the wording differs (unit vs lesson). */
  titles?: Partial<Record<CourseId, string>>;
  target: number;
  xp: number;
  metric: QuestMetric;
}

/** The day the tutor quest joins the pool (Sprint 10). */
export const TUTOR_QUESTS_SINCE = '2026-09-26';
/** The day the video lesson quest joins the pool (Sprint 12). */
export const VIDEO_QUESTS_SINCE = '2026-09-27';
/**
 * The day quests follow the learner's course (Medina course, ADR-0025). Earlier days keep the
 * quests they had, so no quest done and no XP earned changes.
 */
export const COURSE_QUESTS_SINCE = '2026-10-11';

export const QUEST_XP: Record<QuestSlot, number> & { bonus: number } = {
  review: 30,
  learn: 25,
  produce: 25,
  bonus: 20,
};

/** Every quest is doable in a few minutes with any unit (no microphone needed). */
export const QUEST_POOL: Record<QuestSlot, readonly QuestDef[]> = {
  review: [
    {
      id: 'review-10',
      slot: 'review',
      title: 'Wiederhole 10 Karten',
      target: 10,
      xp: QUEST_XP.review,
      metric: { kind: 'reviews' },
    },
    {
      id: 'review-20',
      slot: 'review',
      title: 'Wiederhole 20 Karten',
      target: 20,
      xp: QUEST_XP.review,
      metric: { kind: 'reviews' },
    },
    {
      id: 'correct-12',
      slot: 'review',
      title: '12 Karten richtig, mindestens 80 % Treffer',
      target: 12,
      xp: QUEST_XP.review,
      metric: { kind: 'correct', minRatio: 0.8 },
    },
  ],
  learn: [
    {
      id: 'new-3',
      slot: 'learn',
      title: 'Lerne 3 neue Wörter',
      target: 3,
      xp: QUEST_XP.learn,
      metric: { kind: 'new-cards' },
    },
    {
      id: 'new-5',
      slot: 'learn',
      title: 'Lerne 5 neue Wörter',
      target: 5,
      xp: QUEST_XP.learn,
      metric: { kind: 'new-cards' },
    },
    {
      id: 'listen-1',
      slot: 'learn',
      title: 'Höre einen Dialog ganz an',
      target: 1,
      xp: QUEST_XP.learn,
      metric: { kind: 'tracks' },
      courses: ['bayna-yadayk'],
    },
    {
      id: 'video-1',
      slot: 'learn',
      title: 'Schau eine Videolektion ganz an',
      target: 1,
      xp: QUEST_XP.learn,
      metric: { kind: 'videos' },
      since: VIDEO_QUESTS_SINCE,
      requires: 'videos',
    },
    {
      id: 'words-5',
      slot: 'learn',
      title: 'Übe 5 Wörter deiner Lektion',
      target: 5,
      xp: QUEST_XP.learn,
      metric: { kind: 'practice', skills: ['words'] },
      since: COURSE_QUESTS_SINCE,
      courses: ['madinah'],
    },
  ],
  produce: [
    {
      id: 'write-3',
      slot: 'produce',
      title: 'Schreibe 3 Wörter richtig',
      target: 3,
      xp: QUEST_XP.produce,
      metric: { kind: 'practice', skills: ['write'] },
    },
    {
      id: 'read-1',
      slot: 'produce',
      title: 'Lies einen Dialog',
      target: 1,
      xp: QUEST_XP.produce,
      // A dialogue read before counts again (once per day): a unit has only a few.
      metric: { kind: 'practice', skills: ['read', 'reread'] },
      courses: ['bayna-yadayk'],
    },
    {
      id: 'cloze-3',
      slot: 'produce',
      title: 'Löse 3 Lückensätze',
      target: 3,
      xp: QUEST_XP.produce,
      metric: { kind: 'practice', skills: ['cloze'] },
    },
    {
      id: 'practice-5',
      slot: 'produce',
      title: '5 Übungen in deiner Einheit',
      titles: { madinah: '5 Übungen in deiner Lektion' },
      target: 5,
      xp: QUEST_XP.produce,
      metric: { kind: 'practice' },
    },
    {
      id: 'tutor-ar-1',
      slot: 'produce',
      title: 'Schreib al-Muʿallim etwas auf Arabisch',
      target: 1,
      xp: QUEST_XP.produce,
      metric: { kind: 'practice', skills: ['tutor'] },
      since: TUTOR_QUESTS_SINCE,
      requires: 'tutor',
    },
  ],
};

const SLOTS: readonly QuestSlot[] = ['review', 'learn', 'produce'];

/** FNV-1a: a small, stable hash so the pick is the same on every device. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Whether `quest` can come up on `day` for this learner. */
function eligible(quest: QuestDef, day: string, features: QuestFeatures): boolean {
  if (quest.since && quest.since > day) return false;
  if (quest.requires && features[quest.requires] !== true) return false;
  if (day < COURSE_QUESTS_SINCE) return true;
  const course = features.course ?? DEFAULT_COURSE;
  if (quest.courses && !quest.courses.includes(course)) return false;
  // A video quest only where the learner's course has video lessons.
  if (quest.requires === 'videos' && features.videoCourses) {
    return features.videoCourses.includes(course);
  }
  return true;
}

/**
 * The three quests of `day` (`YYYY-MM-DD`) for a learner with these features, titled for
 * their course.
 */
export function dailyQuests(day: string, features: QuestFeatures = {}): QuestDef[] {
  const course = features.course ?? DEFAULT_COURSE;
  return SLOTS.map((slot) => {
    const pool = QUEST_POOL[slot].filter((q) => eligible(q, day, features));
    const quest = pool[hash(`${day}:${slot}`) % pool.length] as QuestDef;
    const title = day >= COURSE_QUESTS_SINCE ? quest.titles?.[course] : undefined;
    return title ? { ...quest, title } : quest;
  });
}

/** One learning action of a day, the unit quests count. */
export interface Tick {
  at: string;
  kind: 'review' | 'track' | 'practice';
  /** A track that is a video lesson. */
  video?: boolean;
  correct?: boolean;
  /** First successful review of this card ever. */
  firstSuccess?: boolean;
  skill?: string;
}

/** The learning actions per local day, in time order. */
export function ticksByDay(
  input: Pick<EngagementInput, 'reviews' | 'tracks' | 'practice'>,
  timeZone: string
): Map<string, Tick[]> {
  const ticks: Tick[] = [];
  const learned = new Set<string>();
  const reviews = input.reviews
    .filter((r) => !r.deleted)
    .sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  for (const r of reviews) {
    const correct = r.rating === 'good' || r.rating === 'easy';
    const firstSuccess = correct && !learned.has(r.cardId);
    if (firstSuccess) learned.add(r.cardId);
    ticks.push({ at: r.reviewedAt, kind: 'review', correct, firstSuccess });
  }
  for (const t of input.tracks) {
    if (!t.deleted && t.completedAt) {
      ticks.push({ at: t.completedAt, kind: 'track', video: t.id.startsWith('yt/') });
    }
  }
  for (const p of input.practice) {
    if (p.deleted) continue;
    if (p.skill === 'relisten') {
      // A track heard to the end again counts like a track heard (record id
      // `<unit>:relisten:<track id>@<day>`).
      ticks.push({
        at: p.practisedAt,
        kind: 'track',
        video: p.id.includes(':relisten:yt/'),
      });
    } else {
      ticks.push({ at: p.practisedAt, kind: 'practice', skill: p.skill });
    }
  }
  ticks.sort((a, b) => a.at.localeCompare(b.at));
  const byDay = new Map<string, Tick[]>();
  for (const tick of ticks) {
    const day = dayKey(tick.at, timeZone);
    byDay.set(day, [...(byDay.get(day) ?? []), tick]);
  }
  return byDay;
}

export interface QuestStatus {
  quest: QuestDef;
  progress: number;
  done: boolean;
  /** When the target was reached. */
  doneAt: string | null;
}

function counts(metric: QuestMetric, tick: Tick): boolean {
  switch (metric.kind) {
    case 'reviews':
      return tick.kind === 'review';
    case 'correct':
      return tick.kind === 'review' && tick.correct === true;
    case 'new-cards':
      return tick.kind === 'review' && tick.firstSuccess === true;
    case 'tracks':
      return tick.kind === 'track';
    case 'videos':
      return tick.kind === 'track' && tick.video === true;
    case 'practice':
      return (
        tick.kind === 'practice' &&
        (!metric.skills || metric.skills.includes(tick.skill as string))
      );
  }
}

/** Progress of one quest over the day's ticks (in time order). */
export function questStatus(quest: QuestDef, ticks: readonly Tick[]): QuestStatus {
  let progress = 0;
  let reviews = 0;
  let doneAt: string | null = null;
  for (const tick of ticks) {
    if (tick.kind === 'review') reviews++;
    if (counts(quest.metric, tick)) progress++;
    if (doneAt === null && progress >= quest.target) {
      // The accuracy condition must hold at the moment the target is reached.
      const accurate =
        quest.metric.kind !== 'correct' || progress / reviews >= quest.metric.minRatio;
      if (accurate) doneAt = tick.at;
    }
  }
  return {
    quest,
    progress: Math.min(progress, quest.target),
    done: doneAt !== null,
    doneAt,
  };
}

export interface DayQuests {
  day: string;
  quests: QuestStatus[];
  /** All three done: the bonus was earned at `bonusAt`. */
  bonusAt: string | null;
}

/** The quests of `day` with their progress. */
export function evaluateDay(
  day: string,
  ticks: readonly Tick[],
  features: QuestFeatures = {}
): DayQuests {
  const quests = dailyQuests(day, features).map((q) => questStatus(q, ticks));
  const bonusAt = quests.every((q) => q.done)
    ? (quests
        .map((q) => q.doneAt as string)
        .sort()
        .at(-1) as string)
    : null;
  return { day, quests, bonusAt };
}

/** XP events for the quests done (and bonuses earned) on these days. */
export function questXpEvents(days: readonly DayQuests[]): XpEvent[] {
  return days.flatMap((d) => [
    ...d.quests
      .filter((q) => q.done)
      .map((q) => ({
        at: q.doneAt as string,
        points: q.quest.xp,
        kind: 'quest' as const,
        ref: `${d.day}:${q.quest.id}`,
      })),
    ...(d.bonusAt
      ? [
          {
            at: d.bonusAt,
            points: QUEST_XP.bonus,
            kind: 'quest-bonus' as const,
            ref: d.day,
          },
        ]
      : []),
  ]);
}
