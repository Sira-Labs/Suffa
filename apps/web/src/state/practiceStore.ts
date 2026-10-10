import Dexie from 'dexie';
import { create } from 'zustand';
import { dayKey } from '@suffa/engagement';
import type { CourseSkill, PracticeRecord, PracticeSkill, RepeatSkill } from '@/types';
import { logger } from '@/services/logger';
import { practiceRepo } from '@/services/storage';
import { practiceId } from '@/services/practice';
import { XP_RULES } from '@/services/engagement/xp';

export interface PracticeOutcome {
  /** First success with this item (only then XP is earned). */
  first: boolean;
  /** That made every item of the skill station done. */
  stationComplete: boolean;
  xp: number;
}

interface PracticeState {
  records: Record<string, PracticeRecord>;
  loaded: boolean;
  load(): Promise<void>;
  /**
   * Records a successful item of a unit skill. `items` are the station's items, used to
   * detect the moment the station becomes complete.
   */
  practise(
    unit: number,
    skill: PracticeSkill | CourseSkill,
    itemId: string,
    items: readonly string[]
  ): Promise<PracticeOutcome>;
  /**
   * Records that an item done before was done again today (`reread`, `relisten`): once per
   * item and day, for the daily quests, without XP. Returns whether it was new today.
   */
  practiseAgain(unit: number, skill: RepeatSkill, itemId: string): Promise<boolean>;
}

/** Repeats of these skills count for the daily quests ("Lies einen Dialog"). */
const REPEAT_OF: Partial<Record<PracticeSkill | CourseSkill, RepeatSkill>> = {
  read: 'reread',
};

const REPEAT: PracticeOutcome = { first: false, stationComplete: false, xp: 0 };
const log = logger.child('practice');

/** Items shown as done in memory whose IndexedDB write has not settled yet. */
const pending = new Set<string>();

export const usePracticeStore = create<PracticeState>((set, get) => ({
  records: {},
  loaded: false,

  async load() {
    const all = await practiceRepo.all();
    set({ records: Object.fromEntries(all.map((r) => [r.id, r])), loaded: true });
  },

  async practise(unit, skill, itemId, items) {
    const id = practiceId(unit, skill, itemId);
    if (get().records[id]) {
      const repeat = REPEAT_OF[skill];
      if (repeat) await get().practiseAgain(unit, repeat, itemId);
      return REPEAT;
    }
    const now = new Date().toISOString();
    const record: PracticeRecord = {
      id,
      unit,
      skill,
      itemId,
      practisedAt: now,
      updated_at: now,
      deleted: false,
    };
    // Memory first, synchronously, so quick successive answers build on each other.
    set({ records: { ...get().records, [id]: record } });
    pending.add(id);
    try {
      await practiceRepo.put(record);
    } catch (error) {
      // The write failed (IndexedDB: quota, private mode, closed database). Forget the item in
      // memory too: it counts again next time, and no XP is given for progress a reload would
      // lose. Only this item is removed, so answers saved meanwhile stay. Anything but a
      // storage error is a bug and goes on to the caller.
      const rest = { ...get().records };
      delete rest[id];
      set({ records: rest });
      if (!(error instanceof Dexie.DexieError || error instanceof DOMException))
        throw error;
      log.error('save_failed', { id, error: error.name });
      return REPEAT;
    } finally {
      pending.delete(id);
    }
    // Complete only from stored items: an item still being written could yet fail. With two
    // quick answers, the write that settles last reports the completed station.
    const stored = get().records;
    const stationComplete =
      items.length > 0 &&
      items.every((item) => {
        const key = practiceId(unit, skill, item);
        return Boolean(stored[key]) && !pending.has(key);
      });
    return { first: true, stationComplete, xp: XP_RULES.itemPractised };
  },

  async practiseAgain(unit, skill, itemId) {
    const day = dayKey(
      new Date(),
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
    );
    const repeatId = `${itemId}@${day}`;
    const id = practiceId(unit, skill, repeatId);
    if (get().records[id]) return false;
    const now = new Date().toISOString();
    const record: PracticeRecord = {
      id,
      unit,
      skill,
      itemId: repeatId,
      practisedAt: now,
      updated_at: now,
      deleted: false,
    };
    set({ records: { ...get().records, [id]: record } });
    try {
      await practiceRepo.put(record);
      return true;
    } catch (error) {
      const rest = { ...get().records };
      delete rest[id];
      set({ records: rest });
      if (!(error instanceof Dexie.DexieError || error instanceof DOMException))
        throw error;
      log.error('save_failed', { id, error: error.name });
      return false;
    }
  },
}));
