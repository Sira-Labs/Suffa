/**
 * Courses in the app (ADR-0025): which textbook stream the learner follows, and the Medina
 * course's lesson index (links to the book, its keys and the author's audio, no book text).
 */
import { COURSES, DEFAULT_COURSE, isCourseId, type CourseId } from '@suffa/engagement';
import { useSettingsStore } from '@/state';
import madinahBook1 from '@/content/courses/madinah/book1.json';
import madinahBook1Lessons from '@/content/courses/madinah/book1-lessons.json';

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
    /** archive.org holds the identical book PDF, which may be embedded. */
    archiveItem: string;
    archiveBookPath: string;
    vocabularyList: string;
    grammarRules: string;
    crossword: string;
    slideNotes: string;
  };
  lessons: MadinahLesson[];
}

export const MADINAH_BOOKS: readonly MadinahBook[] = [madinahBook1 as MadinahBook];

/** A word of a lesson: the book's word, our German meaning (ADR-0023). */
export interface MadinahWord {
  /** Stable id (md-<unit>-<n>), kept when cards are made from it later. */
  id: string;
  ar: string;
  de: string;
}

/** A grammar point in our own words, with our own examples. */
export interface MadinahGrammar {
  title: string;
  text: string;
  examples: { ar: string; de: string }[];
}

/** Our own content for a lesson (draft until a teacher has reviewed it). */
export interface MadinahLessonContent {
  unit: number;
  lesson: number;
  topic: string;
  status: 'draft' | 'reviewed';
  words: MadinahWord[];
  grammar: MadinahGrammar[];
}

const LESSON_CONTENT: ReadonlyMap<number, MadinahLessonContent> = new Map(
  (madinahBook1Lessons.lessons as MadinahLessonContent[]).map((l) => [l.unit, l])
);

/** Our own words and grammar for a lesson, where written yet. */
export function madinahLessonContent(unit: number): MadinahLessonContent | null {
  return LESSON_CONTENT.get(unit) ?? null;
}

/** The book and lesson for a lesson number of a book. */
export function madinahLesson(
  bookNo: number,
  lessonNo: number
): { book: MadinahBook; lesson: MadinahLesson } | null {
  const book = MADINAH_BOOKS.find((b) => b.book === bookNo);
  const lesson = book?.lessons.find((l) => l.lesson === lessonNo);
  return book && lesson ? { book, lesson } : null;
}

/**
 * The book PDF at archive.org (the identical file), at a page. Unlike the item's BookReader,
 * which holds many PDFs and may open another one, this URL always names Book 1. archive.org
 * serves it inline and allows embedding it.
 */
export function archivePdfUrl(book: MadinahBook, page: number): string {
  const { archiveItem, archiveBookPath } = book.sources;
  return `https://archive.org/download/${archiveItem}/${archiveBookPath}#page=${page}`;
}

/** The archive.org item with everything for the course (books, keys, notes, audio). */
export function archiveItemUrl(book: MadinahBook): string {
  return `https://archive.org/details/${book.sources.archiveItem}`;
}

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
