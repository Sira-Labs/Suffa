/**
 * How the LLM prompts name a course and its units (ADR-0025). Prompts are in English, so a
 * course is named by its book in Latin transliteration, and a unit by the number learners see
 * inside their course ("Lesson 3" for unit 103).
 */
import {
  DEFAULT_COURSE,
  courseById,
  courseOfUnit,
  isCourseId,
  unitLabelNumber,
  type CourseId,
} from '@suffa/engagement';

const BOOK: Record<CourseId, string> = {
  'bayna-yadayk': 'the book series "al-ʿArabiyya bayna yadayk"',
  madinah: 'the Madinah Arabic course "Durūs al-lugha al-ʿarabiyya", book 1',
};

/** The course's book as prompts name it, e.g. `the book series "al-ʿArabiyya bayna yadayk"`. */
export function courseBook(course: CourseId): string {
  return BOOK[course];
}

/** A stored course value (class or settings row), or the default course. */
export function courseOrDefault(value: unknown): CourseId {
  return isCourseId(value) ? value : DEFAULT_COURSE;
}

/** "Unit 3" in the first course, "Lesson 3" in the Madinah course (unit 103). */
export function unitName(unit: number): string {
  const lesson = courseOfUnit(unit)?.id === 'madinah';
  return `${lesson ? 'Lesson' : 'Unit'} ${unitLabelNumber(unit)}`;
}

/** The unit belongs to the course, so its pack fits a prompt that names this course. */
export function inCourse(unit: number, course: CourseId): boolean {
  return courseById(course).units.includes(unit);
}
