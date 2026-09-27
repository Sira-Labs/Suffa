/**
 * Courses (ADR-0025): the textbook streams a class can follow. Each course owns a band of unit
 * numbers, so every id that already carries a unit number (practice records, enrollments, exam
 * results, certificates, class assignments) stays unique across courses without a new column.
 * The first course keeps units 1–16, so nothing stored before courses existed changes.
 */

export type CourseId = 'bayna-yadayk' | 'madinah';

export interface Course {
  id: CourseId;
  /** Learner-facing name (German UI). */
  name: string;
  /** The textbook, as printed. */
  textbook: string;
  /** Unit numbers in learning order. */
  units: readonly number[];
  /** Offered to classes and learners (false while its content is being built). */
  available: boolean;
  /** Its units have our own exercises and a unit test (assignments can ask for them). */
  exercises: boolean;
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Unit 0 stays reserved for course-independent practice (alphabet, recording checkpoints). */
export const COURSES: readonly Course[] = [
  {
    id: 'bayna-yadayk',
    name: 'Al-Arabiyya bayna Yadayk',
    textbook: 'العربية بين يديك – Buch 1',
    units: range(1, 16),
    available: true,
    exercises: true,
  },
  {
    id: 'madinah',
    name: 'Medina-Kurs',
    textbook: 'دروس اللغة العربية – Buch 1',
    // Book 1 has 23 lessons; book n will take (n)01–(n)99.
    units: range(101, 123),
    // Offered with links to the book, the solutions and the author's audio per lesson; our own
    // exercises follow lesson by lesson (ADR-0025, stage 2).
    available: true,
    exercises: false,
  },
];

export const DEFAULT_COURSE: CourseId = 'bayna-yadayk';

export const COURSE_IDS = COURSES.map((c) => c.id) as readonly CourseId[];

export function isCourseId(value: unknown): value is CourseId {
  return typeof value === 'string' && (COURSE_IDS as readonly string[]).includes(value);
}

export function courseById(id: CourseId): Course {
  const course = COURSES.find((c) => c.id === id);
  if (!course) throw new Error(`unknown course ${id}`);
  return course;
}

/** The course a unit number belongs to, or null (unit 0 and unknown numbers). */
export function courseOfUnit(unit: number): Course | null {
  return COURSES.find((c) => c.units.includes(unit)) ?? null;
}

/** The unit's number as learners see it inside its course ("Lektion 3" for unit 103). */
export function unitLabelNumber(unit: number): number {
  const course = courseOfUnit(unit);
  return course ? unit - course.units[0]! + 1 : unit;
}

/** Highest unit number any course may use (book 9 of a course, lesson 99). */
export const MAX_UNIT = 999;
