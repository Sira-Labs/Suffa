/**
 * The class that shapes the app for this user (stories 18.1/18.2): its colour scheme and when
 * its practice areas open. It is the main class the user chose (settings), else the active
 * class they joined first, so joining another class does not change the app; without one the
 * app uses its defaults. The other classes stay fully usable, only the app's look and locks
 * follow this one. The last known class settings are kept in localStorage, so colours and
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

/** The chosen main class while it is active, else the active class joined first, or null. */
export function primaryClass(
  classes: readonly ClassSummary[],
  mainClassId?: string | null
): ClassSummary | null {
  const active = classes.filter((c) => c.status === 'active');
  const chosen = mainClassId ? active.find((c) => c.id === mainClassId) : undefined;
  if (chosen) return chosen;
  return (
    [...active].sort((a, b) =>
      (a.joinedAt ?? a.createdAt).localeCompare(b.joinedAt ?? b.createdAt)
    )[0] ?? null
  );
}

interface ClassContextState {
  context: ClassContext | null;
  /** Takes the user's current classes (signed in and online) and their chosen main class. */
  setClasses(classes: readonly ClassSummary[], mainClassId?: string | null): void;
}

export const useClassContextStore = create<ClassContextState>((set, get) => ({
  context: readStored(),
  setClasses(classes, mainClassId) {
    const primary = primaryClass(classes, mainClassId);
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
