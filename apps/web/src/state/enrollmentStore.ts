import { create } from 'zustand';
import type { ExamResult, UnitEnrollment, UnitPace } from '@/types';
import { enrollmentRepo, examRepo } from '@/services/storage';
import {
  EXTENSION_DAYS,
  PACE_DAYS,
  enrollmentId,
  targetDate,
} from '@/services/enrollment';

const BOOK = 1;

interface EnrollmentState {
  enrollments: Record<number, UnitEnrollment>;
  /** Exam results, for unlocking and completion (reloaded after each exam). */
  exams: ExamResult[];
  loaded: boolean;
  load(): Promise<void>;
  reloadExams(): Promise<void>;
  start(unit: number, pace: UnitPace, now?: Date): Promise<UnitEnrollment>;
  /** Uses the single extension: the target date moves EXTENSION_DAYS past today. */
  extend(unit: number, now?: Date): Promise<UnitEnrollment | null>;
}

export const useEnrollmentStore = create<EnrollmentState>((set, get) => ({
  enrollments: {},
  exams: [],
  loaded: false,

  async load() {
    const [all, exams] = await Promise.all([enrollmentRepo.all(), examRepo.all()]);
    set({
      enrollments: Object.fromEntries(all.map((e) => [e.unit, e])),
      exams,
      loaded: true,
    });
  },

  async reloadExams() {
    set({ exams: await examRepo.all() });
  },

  async start(unit, pace, now = new Date()) {
    const record: UnitEnrollment = {
      id: enrollmentId(BOOK, unit),
      book: BOOK,
      unit,
      pace,
      startedAt: now.toISOString(),
      dueAt: targetDate(now, PACE_DAYS[pace]).toISOString(),
      extended: false,
      updated_at: now.toISOString(),
      deleted: false,
    };
    set({ enrollments: { ...get().enrollments, [unit]: record } });
    return enrollmentRepo.put(record);
  },

  async extend(unit, now = new Date()) {
    const current = get().enrollments[unit];
    if (!current || current.extended) return null;
    const record: UnitEnrollment = {
      ...current,
      dueAt: targetDate(now, EXTENSION_DAYS).toISOString(),
      extended: true,
    };
    set({ enrollments: { ...get().enrollments, [unit]: record } });
    return enrollmentRepo.put(record);
  },
}));
