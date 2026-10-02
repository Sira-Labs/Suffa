/**
 * Courses in the app (ADR-0025): which textbook stream the learner follows, and the Medina
 * course's lesson index (links to the book, its keys and the author's audio, no book text).
 */
import {
  COURSES,
  courseOfUnit,
  DEFAULT_COURSE,
  isCourseId,
  passedTest,
  unitLabelNumber,
  type CourseId,
} from '@suffa/engagement';
import type { ExamResult } from '@/types';
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
  /**
   * Where the lesson starts in the printed "Madinah Arabic Reader" (Goodword Books), which
   * splits the course into 8 books. A reference only; its pages are never shown.
   */
  goodword: { book: number; page: number };
}

export interface MadinahBook {
  book: number;
  /** Pages of the book PDF. */
  pages: number;
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
    /** archive.org's page images of the PDF; `{leaf}` is the 0-based page, 4 digits. */
    archivePageImage: string;
    /** Publisher of the printed "Madinah Arabic Reader". */
    goodword: string;
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

/**
 * A gap sentence of our own: the sentence with `___` where a word is missing, the missing word,
 * the choices (answer included) and the German meaning of the whole sentence.
 */
export interface MadinahGap {
  ar: string;
  answer: string;
  options: string[];
  de: string;
}

/** Our own content for a lesson (draft until a teacher has reviewed it). */
export interface MadinahLessonContent {
  unit: number;
  lesson: number;
  topic: string;
  status: 'draft' | 'reviewed';
  words: MadinahWord[];
  grammar: MadinahGrammar[];
  gaps: MadinahGap[];
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

/**
 * A page of the book as an image that archive.org derives from the PDF (plain images, so they
 * show on every device, unlike an embedded PDF). `reduced` halves the size for the page view.
 */
export function bookPageImageUrl(
  book: MadinahBook,
  page: number,
  reduced = true
): string {
  const leaf = String(page - 1).padStart(4, '0');
  const url = book.sources.archivePageImage.replace('{leaf}', leaf);
  return reduced ? `${url}&reduce=2` : url;
}

/** The PDF pages of a lesson: from its first page to the page before the next lesson. */
export function lessonPages(book: MadinahBook, lesson: MadinahLesson): number[] {
  const next = book.lessons.find((l) => l.lesson === lesson.lesson + 1);
  const last = next ? next.page - 1 : book.pages;
  return Array.from({ length: last - lesson.page + 1 }, (_, i) => lesson.page + i);
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

/** The page of a Medina unit (101 → lesson 1 of book 1). */
export function madinahLessonPath(unit: number): string {
  return `/units/madinah/${unitLabelNumber(unit)}`;
}

/** Where a learner stands in one Medina lesson. */
export interface MadinahLessonState {
  book: MadinahBook;
  lesson: MadinahLesson;
  /** Our topic for the lesson, where its content is written. */
  topic: string | null;
  /** Its lesson test is passed (80 %). */
  passed: boolean;
}

/**
 * The learner's way through the Medina books: every lesson with its test result, how many are
 * passed and the lesson to work on next (the first one not passed; none once all are).
 */
export function madinahProgress(exams: readonly ExamResult[]): {
  lessons: MadinahLessonState[];
  passed: number;
  next: MadinahLessonState | null;
} {
  const lessons = MADINAH_BOOKS.flatMap((book) =>
    book.lessons.map<MadinahLessonState>((lesson) => ({
      book,
      lesson,
      topic: madinahLessonContent(lesson.unit)?.topic ?? null,
      passed: passedTest(exams, lesson.unit) !== null,
    }))
  );
  return {
    lessons,
    passed: lessons.filter((l) => l.passed).length,
    next: lessons.find((l) => !l.passed) ?? null,
  };
}

/** "Einheit 3" for a Bayna Yadayk unit, "Lektion 3" for a Medina unit (103). */
export function unitLabel(unit: number): string {
  const madinah = courseOfUnit(unit)?.id === 'madinah';
  return `${madinah ? 'Lektion' : 'Einheit'} ${unitLabelNumber(unit)}`;
}
