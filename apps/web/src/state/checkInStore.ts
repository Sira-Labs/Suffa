import { create } from 'zustand';
import type { DailyCheckIn } from '@/types';
import { checkInRepo } from '@/services/storage';
import { XP_RULES } from '@/services/engagement/xp';
import { localDay } from '@/services/today';

interface CheckInState {
  /** By local day (`YYYY-MM-DD`). */
  checkIns: Record<string, DailyCheckIn>;
  loaded: boolean;
  load(): Promise<void>;
  /** Checks in for today with the word of the day; XP only the first time a day. */
  checkIn(wordId: string, now?: Date): Promise<{ first: boolean; xp: number }>;
}

export const useCheckInStore = create<CheckInState>((set, get) => ({
  checkIns: {},
  loaded: false,

  async load() {
    const all = await checkInRepo.all();
    set({ checkIns: Object.fromEntries(all.map((c) => [c.id, c])), loaded: true });
  },

  async checkIn(wordId, now = new Date()) {
    const day = localDay(now);
    if (get().checkIns[day]) return { first: false, xp: 0 };
    const at = now.toISOString();
    const record: DailyCheckIn = {
      id: day,
      wordId,
      checkedAt: at,
      updated_at: at,
      deleted: false,
    };
    set({ checkIns: { ...get().checkIns, [day]: record } });
    await checkInRepo.put(record);
    return { first: true, xp: XP_RULES.dailyCheckIn };
  },
}));
