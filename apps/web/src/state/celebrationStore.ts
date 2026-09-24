import { create } from 'zustand';

export interface Celebration {
  id: number;
  /** Learner-facing (German). */
  title: string;
  xp: number;
  /** Bigger burst for milestones (e.g. a whole lesson). */
  big: boolean;
}

interface CelebrationState {
  current: Celebration | null;
  show(c: Omit<Celebration, 'id'>): void;
  dismiss(): void;
}

let nextId = 1;

export const useCelebrationStore = create<CelebrationState>((set) => ({
  current: null,
  show(c) {
    set({ current: { ...c, id: nextId++ } });
  },
  dismiss() {
    set({ current: null });
  },
}));
