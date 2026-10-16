/**
 * The class that shapes the app for this user (stories 18.1/18.2): its colour scheme and when
 * its practice areas open. It is the active class the user joined last; without one the app
 * uses its defaults. The last known class settings are kept in localStorage, so colours and
 * locks hold offline and right after start, before the class list arrives.
 */
import { create } from 'zustand';
import {
  isAreaUnlocks,
  isCourseId,
  isPaletteId,
  type AreaUnlocks,
  type CourseId,
  type PaletteId,
} from '@suffa/engagement';
import type { ClassSummary } from '@/services/classes/classesApi';

export interface ClassContext {
  classId: string;
  course: CourseId;
  palette: PaletteId;
  unlocks: AreaUnlocks;
}

const STORAGE_KEY = 'suffa.classContext';

/** The remembered class settings, if well-formed. */
export function readStored(): ClassContext | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ClassContext>;
    // Written by an older app or changed by hand: only well-formed settings are used.
    if (
      typeof value.classId !== 'string' ||
      !isPaletteId(value.palette) ||
      !isCourseId(value.course) ||
      !isAreaUnlocks(value.unlocks)
    ) {
      return null;
    }
    return {
      classId: value.classId,
      course: value.course,
      palette: value.palette,
      unlocks: value.unlocks,
    };
  } catch {
    // Private mode or blocked storage: start without a remembered class.
    return null;
  }
}

function store(context: ClassContext | null) {
  try {
    if (context) globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(context));
    else globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    // Not remembered: the next start waits for the class list again.
  }
}

/** The active class joined last, or null. */
export function primaryClass(classes: readonly ClassSummary[]): ClassSummary | null {
  const active = classes.filter((c) => c.status === 'active');
  return (
    active.sort((a, b) =>
      (b.joinedAt ?? b.createdAt).localeCompare(a.joinedAt ?? a.createdAt)
    )[0] ?? null
  );
}

interface ClassContextState {
  context: ClassContext | null;
  /** Takes the user's current classes (signed in and online). */
  setClasses(classes: readonly ClassSummary[]): void;
}

export const useClassContextStore = create<ClassContextState>((set, get) => ({
  context: readStored(),
  setClasses(classes) {
    const primary = primaryClass(classes);
    const next: ClassContext | null = primary
      ? {
          classId: primary.id,
          course: primary.course ?? 'bayna-yadayk',
          palette: isPaletteId(primary.palette) ? primary.palette : 'oase',
          unlocks: isAreaUnlocks(primary.unlocks) ? primary.unlocks : {},
        }
      : null;
    if (JSON.stringify(next) === JSON.stringify(get().context)) return;
    store(next);
    set({ context: next });
  },
}));
