/**
 * Courses in the app (ADR-0025): which textbook stream the learner follows, and the Medina
 * course's lesson index (links to the book, its keys and the author's audio, no book text).
 */
import { COURSES, DEFAULT_COURSE, isCourseId, type CourseId } from '@suffa/engagement';
import { useSettingsStore } from '@/state';
import madinahBook1 from '@/content/courses/madinah/book1.json';

export interface MadinahLesson {
  /** Unit number in the course band (101 = book 1, lesson 1). */
  unit: number;
  lesson: number;
  /** The book's lesson heading ("الدرس الأول"). */
  title: string;
  /** Page of the book PDF where the lesson starts. */
  page: number;
  /** The author's recording of the lesson (archive.org). */
  audio: string;
}

export interface MadinahBook {
  book: number;
  title: string;
  author: string;
  sources: {
    book: string;
    solutions: string;
    englishKey: string;
    glossary: string;
    classNotes: string;
    videos: string;
    overview: string;
    audioCollection: string;
  };
  lessons: MadinahLesson[];
}

export const MADINAH_BOOKS: readonly MadinahBook[] = [madinahBook1 as MadinahBook];

/** A link that opens the book PDF at a page (browsers' PDF viewers honour #page). */
export function bookPageUrl(book: MadinahBook, page: number): string {
  return `${book.sources.book}#page=${page}`;
}

/** Courses a learner or teacher can choose. */
export const OFFERED_COURSES = COURSES.filter((c) => c.available);

/** The course the learner follows (their own choice; the default before they chose). */
export function useActiveCourse(): CourseId {
  const course = useSettingsStore((s) => s.settings.course);
  return isCourseId(course) ? course : DEFAULT_COURSE;
}

export function useSetCourse(): (course: CourseId) => Promise<void> {
  const update = useSettingsStore((s) => s.update);
  return (course) => update({ course });
}
