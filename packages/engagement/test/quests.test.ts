import { describe, expect, it } from 'vitest';
import {
  COURSE_QUESTS_SINCE,
  dailyQuests,
  evaluateDay,
  practiceXpEvents,
  QUEST_POOL,
  questStatus,
  TUTOR_QUESTS_SINCE,
  questXpEvents,
  ticksByDay,
  type QuestDef,
  type Tick,
} from '../src/index.js';
import { practice, review, track, TZ } from './fixtures.js';

const quest = (metric: QuestDef['metric'], target: number): QuestDef => ({
  id: 'q',
  slot: 'review',
  title: 'q',
  target,
  xp: 30,
  metric,
});
const tick = (at: string, extra: Partial<Tick>): Tick => ({
  at,
  kind: 'review',
  ...extra,
});

describe('daily quests', () => {
  it('picks one quest per slot, the same for a day on every device', () => {
    const day = dailyQuests('2026-09-24');
    expect(day.map((q) => q.slot)).toEqual(['review', 'learn', 'produce']);
    expect(dailyQuests('2026-09-24')).toEqual(day);
    // Over a month every quest of every pool comes up.
    const seen = new Set(
      Array.from({ length: 60 }, (_, i) =>
        dailyQuests(new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10))
      )
        .flat()
        .map((q) => q.id)
    );
    const all = Object.values(QUEST_POOL)
      .flat()
      .filter((q) => !q.requires && (!q.courses || q.courses.includes('bayna-yadayk')));
    expect(all.every((q) => seen.has(q.id))).toBe(true);
  });

  it('keeps the quests of every earlier day when a new quest joins the pool', () => {
    const days = Array.from({ length: 120 }, (_, i) =>
      new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10)
    ).filter((d) => d < TUTOR_QUESTS_SINCE);
    for (const day of days) {
      expect(dailyQuests(day, { tutor: true })).toEqual(dailyQuests(day));
    }
  });

  it('offers the video quest only from its start day and with lessons in the catalog', () => {
    const later = Array.from({ length: 60 }, (_, i) =>
      new Date(Date.UTC(2026, 8, 27 + i)).toISOString().slice(0, 10)
    );
    expect(
      later.flatMap((d) => dailyQuests(d, { videos: true }).map((q) => q.id))
    ).toContain('video-1');
    expect(later.flatMap((d) => dailyQuests(d).map((q) => q.id))).not.toContain(
      'video-1'
    );
    for (const day of ['2026-09-20', '2026-09-26']) {
      expect(dailyQuests(day, { videos: true, tutor: true })).toEqual(
        dailyQuests(day, { tutor: true })
      );
    }
    const video = QUEST_POOL.learn.find((q) => q.id === 'video-1')!;
    const at = '2026-10-01T09:00:00.000Z';
    expect(questStatus(video, [tick(at, { kind: 'track', video: false })]).progress).toBe(
      0
    );
    expect(questStatus(video, [tick(at, { kind: 'track', video: true })]).done).toBe(
      true
    );
    expect(
      ticksByDay(
        {
          reviews: [],
          tracks: [track('yt/abc', 'yt', at), track('rec/x', 'rec/c', at)],
          practice: [],
        },
        TZ
      )
        .get('2026-10-01')
        ?.map((t) => t.video)
    ).toEqual([true, false]);
  });

  it("follows the learner's course from its start day, keeping earlier days", () => {
    const days = (from: number, count: number) =>
      Array.from({ length: count }, (_, i) =>
        new Date(Date.UTC(2026, 9, from + i)).toISOString().slice(0, 10)
      );
    const before = days(-60, 70).filter((d) => d < COURSE_QUESTS_SINCE);
    const after = days(11, 90);
    const all = { tutor: true, videos: true };
    // Earlier days: the same quests whatever the course (no quest or XP changes).
    for (const day of before) {
      expect(dailyQuests(day, { ...all, course: 'madinah' })).toEqual(
        dailyQuests(day, all)
      );
    }
    // Bayna Yadayk learners keep their pool; no course means the default course.
    for (const day of after) {
      expect(dailyQuests(day, { ...all, course: 'bayna-yadayk' })).toEqual(
        dailyQuests(day, all)
      );
    }
    const ids = (course: 'madinah' | 'bayna-yadayk') =>
      new Set(after.flatMap((d) => dailyQuests(d, { ...all, course }).map((q) => q.id)));
    const medina = ids('madinah');
    const bayna = ids('bayna-yadayk');
    // Medina lessons have no dialogues: no dialogue quests, a word quest instead.
    expect(medina.has('listen-1')).toBe(false);
    expect(medina.has('read-1')).toBe(false);
    expect(medina.has('words-5')).toBe(true);
    expect(bayna.has('listen-1')).toBe(true);
    expect(bayna.has('words-5')).toBe(false);
    // Wording: lesson for Medina, unit for Bayna Yadayk.
    const titles = (course: 'madinah' | 'bayna-yadayk') =>
      after
        .flatMap((d) => dailyQuests(d, { ...all, course }))
        .filter((q) => q.id === 'practice-5')
        .map((q) => q.title);
    expect(new Set(titles('madinah'))).toEqual(new Set(['5 Übungen in deiner Lektion']));
    expect(new Set(titles('bayna-yadayk'))).toEqual(
      new Set(['5 Übungen in deiner Einheit'])
    );
  });

  it("offers the video quest only where the learner's course has lessons", () => {
    const after = Array.from({ length: 90 }, (_, i) =>
      new Date(Date.UTC(2026, 9, 11 + i)).toISOString().slice(0, 10)
    );
    const ids = (features: Parameters<typeof dailyQuests>[1]) =>
      after.flatMap((d) => dailyQuests(d, features).map((q) => q.id));
    const onlyBayna = { videos: true, videoCourses: ['bayna-yadayk'] as const };
    expect(ids({ ...onlyBayna, course: 'madinah' })).not.toContain('video-1');
    expect(ids({ ...onlyBayna, course: 'bayna-yadayk' })).toContain('video-1');
    // Unknown catalog courses (older API): any lesson is enough, as before.
    expect(ids({ videos: true, course: 'madinah' })).toContain('video-1');
    // Before the start day the catalog's courses do not matter.
    expect(dailyQuests('2026-10-05', { ...onlyBayna, course: 'madinah' })).toEqual(
      dailyQuests('2026-10-05', { videos: true })
    );
  });

  it('counts a dialogue read or heard again for the dialogue quests', () => {
    const read = QUEST_POOL.produce.find((q) => q.id === 'read-1')!;
    const listen = QUEST_POOL.learn.find((q) => q.id === 'listen-1')!;
    const video = QUEST_POOL.learn.find((q) => q.id === 'video-1')!;
    const at = '2026-10-12T09:00:00.000Z';
    const repeat = (id: string, skill: string) => ({
      id,
      unit: 0,
      skill,
      practisedAt: at,
    });
    const ticks = ticksByDay(
      {
        reviews: [],
        tracks: [],
        practice: [
          repeat('3:reread:d-3-1@2026-10-12', 'reread'),
          repeat('0:relisten:b1/u3/t1@2026-10-12', 'relisten'),
          repeat('0:relisten:yt/abc@2026-10-12', 'relisten'),
        ],
      },
      TZ
    ).get('2026-10-12')!;
    expect(questStatus(read, ticks).done).toBe(true);
    expect(questStatus(listen, ticks).progress).toBe(1);
    expect(questStatus(video, ticks).done).toBe(true);
    // Repeats earn no XP of their own.
    expect(practiceXpEvents([repeat('3:reread:d-3-1@2026-10-12', 'reread')])).toEqual([]);
    expect(practiceXpEvents([repeat('3:read:d-3-1', 'read')])).toHaveLength(1);
  });

  it('counts Medina word practice for the word quest', () => {
    const words = QUEST_POOL.learn.find((q) => q.id === 'words-5')!;
    const at = '2026-10-12T09:00:00.000Z';
    const ticks = [
      ...Array.from({ length: 4 }, () => tick(at, { kind: 'practice', skill: 'words' })),
      tick(at, { kind: 'practice', skill: 'cloze' }),
    ];
    expect(questStatus(words, ticks)).toMatchObject({ progress: 4, done: false });
    expect(
      questStatus(words, [...ticks, tick(at, { kind: 'practice', skill: 'words' })]).done
    ).toBe(true);
  });

  it('offers the tutor quest only from its start day and only with the tutor', () => {
    const later = Array.from({ length: 60 }, (_, i) =>
      new Date(Date.UTC(2026, 8, 26 + i)).toISOString().slice(0, 10)
    );
    const withTutor = later.flatMap((d) =>
      dailyQuests(d, { tutor: true }).map((q) => q.id)
    );
    const without = later.flatMap((d) => dailyQuests(d).map((q) => q.id));
    expect(withTutor).toContain('tutor-ar-1');
    expect(without).not.toContain('tutor-ar-1');
    const tutorDay = later.find((d) =>
      dailyQuests(d, { tutor: true }).some((q) => q.id === 'tutor-ar-1')
    )!;
    const ticks = [
      tick(`${tutorDay}T09:00:00.000Z`, { kind: 'practice', skill: 'tutor' }),
    ];
    const done = evaluateDay(tutorDay, ticks, { tutor: true }).quests.find(
      (q) => q.quest.id === 'tutor-ar-1'
    );
    expect(done).toMatchObject({ done: true, progress: 1 });
  });

  it('groups learning actions by local day and marks first successes', () => {
    const byDay = ticksByDay(
      {
        reviews: [
          review('a', 'good', '2026-09-23T22:30:00.000Z'),
          review('a', 'good', '2026-09-24T08:00:00.000Z'),
          review('b', 'again', '2026-09-24T08:01:00.000Z'),
          review('c', 'good', '2026-09-24T08:02:00.000Z', { deleted: true }),
        ],
        tracks: [
          track('t', 'l', '2026-09-24T09:00:00.000Z'),
          track('u', 'l', null),
          track('v', 'l', '2026-09-24T09:00:00.000Z', true),
        ],
        practice: [
          practice('p', 'write', '2026-09-24T10:00:00.000Z'),
          practice('q', 'write', '2026-09-24T10:00:00.000Z', true),
        ],
      },
      TZ
    );
    const day = byDay.get('2026-09-24') as Tick[];
    expect(day.map((t) => [t.kind, t.firstSuccess ?? null])).toEqual([
      ['review', true], // 22:30 UTC on the 23rd is the 24th in Zurich
      ['review', false],
      ['review', false],
      ['track', null],
      ['practice', null],
    ]);
  });

  it('counts each metric and records when the target was reached', () => {
    const ticks: Tick[] = [
      tick('t1', { correct: true, firstSuccess: true }),
      tick('t2', { correct: false }),
      tick('t3', { kind: 'track' }),
      tick('t4', { kind: 'practice', skill: 'write' }),
      tick('t5', { kind: 'practice', skill: 'read' }),
    ];
    expect(questStatus(quest({ kind: 'reviews' }, 2), ticks)).toMatchObject({
      progress: 2,
      done: true,
      doneAt: 't2',
    });
    expect(questStatus(quest({ kind: 'new-cards' }, 2), ticks)).toMatchObject({
      progress: 1,
      done: false,
      doneAt: null,
    });
    expect(questStatus(quest({ kind: 'tracks' }, 1), ticks).doneAt).toBe('t3');
    expect(
      questStatus(quest({ kind: 'practice', skills: ['read'] }, 1), ticks).doneAt
    ).toBe('t5');
    expect(questStatus(quest({ kind: 'practice' }, 5), ticks)).toMatchObject({
      progress: 2,
      done: false,
    });
    // Progress never shows more than the target.
    expect(questStatus(quest({ kind: 'reviews' }, 1), ticks).progress).toBe(1);
  });

  it('needs the accuracy when the correct-answers target is reached', () => {
    const correct = quest({ kind: 'correct', minRatio: 0.8 }, 2);
    const sloppy = [
      tick('a', { correct: false }),
      tick('b', { correct: true }),
      tick('c', { correct: true }), // 2 of 3 = 67 %
      tick('d', { correct: true }), // 3 of 4 = 75 %
      tick('e', { correct: true }), // 4 of 5 = 80 % → done now
    ];
    expect(questStatus(correct, sloppy)).toMatchObject({ done: true, doneAt: 'e' });
    expect(questStatus(correct, sloppy.slice(0, 4)).done).toBe(false);
  });

  it('pays done quests and the bonus for all three', () => {
    const day = '2026-09-24';
    const [r, l, p] = dailyQuests(day) as [QuestDef, QuestDef, QuestDef];
    // Enough of everything to finish any quest of the day.
    const ticks: Tick[] = [
      ...Array.from({ length: 25 }, (_, i) =>
        tick(`2026-09-24T08:${String(i).padStart(2, '0')}:00.000Z`, {
          correct: true,
          firstSuccess: true,
        })
      ),
      tick('2026-09-24T09:00:00.000Z', { kind: 'track' }),
      ...['write', 'read', 'cloze', 'write', 'write'].map((skill, i) =>
        tick(`2026-09-24T10:0${i}:00.000Z`, { kind: 'practice', skill })
      ),
      tick('2026-09-24T10:10:00.000Z', { kind: 'practice', skill: 'cloze' }),
      tick('2026-09-24T10:11:00.000Z', { kind: 'practice', skill: 'cloze' }),
    ];
    const done = evaluateDay(day, ticks);
    expect(done.quests.map((q) => q.quest.id)).toEqual([r.id, l.id, p.id]);
    expect(done.bonusAt).not.toBeNull();
    const events = questXpEvents([done, evaluateDay('2026-09-25', [])]);
    expect(events.map((e) => e.kind)).toEqual(['quest', 'quest', 'quest', 'quest-bonus']);
    expect(events.reduce((s, e) => s + e.points, 0)).toBe(30 + 25 + 25 + 20);
    expect(evaluateDay(day, ticks.slice(0, 1)).bonusAt).toBeNull();
  });
});
