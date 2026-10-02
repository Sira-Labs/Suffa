import Dexie from 'dexie';
import { create } from 'zustand';
import type { CourseSkill, PracticeRecord, PracticeSkill } from '@/types';
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
}

const REPEAT: PracticeOutcome = { first: false, stationComplete: false, xp: 0 };
const log = logger.child('practice');

export const usePracticeStore = create<PracticeState>((set, get) => ({
  records: {},
  loaded: false,

  async load() {
    const all = await practiceRepo.all();
    set({ records: Object.fromEntries(all.map((r) => [r.id, r])), loaded: true });
  },

  async practise(unit, skill, itemId, items) {
    const id = practiceId(unit, skill, itemId);
    if (get().records[id]) return REPEAT;
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
    const records = { ...get().records, [id]: record };
    set({ records });
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
    }
    const stationComplete =
      items.length > 0 && items.every((item) => records[practiceId(unit, skill, item)]);
    return { first: true, stationComplete, xp: XP_RULES.itemPractised };
  },
}));
