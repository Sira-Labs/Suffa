/**
 * The Medina book follows the author's recording: for each lesson, when each page starts and,
 * once marked, where each line sits on its page and when it is read (API: /book-sync). Only
 * seconds and page coordinates, no book text (ADR-0023). The last answer is kept on the device,
 * so the book still follows the recording offline.
 */
import { useCallback, useEffect, useState } from 'react';
import { apiRequest, type ApiResult } from '@/services/api/request';
import { logger } from '@/services/logger';

const log = logger.child('courses:book-sync');

export interface PageStart {
  page: number;
  /** Seconds into the lesson's recording. */
  at: number;
}

export interface SyncLine {
  page: number;
  /** Fractions of the page image: x, y, width, height. */
  box: [number, number, number, number];
  start: number;
  end: number;
}

export interface LessonSync {
  lesson: number;
  revision: number;
  pages: PageStart[];
  lines: SyncLine[];
  updatedAt?: string;
}

export interface BookSync {
  course: string;
  book: number;
  lessons: LessonSync[];
}

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

const storageKey = (course: string, book: number) => `suffa.bookSync.${course}.${book}`;

function deviceStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch (error) {
    // Storage blocked (private mode, sandboxed frame): work without the offline copy.
    log.warn('storage unavailable', { error: String(error) });
    return null;
  }
}

function isBookSync(value: unknown): value is BookSync {
  const v = value as BookSync | null;
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof v.course === 'string' &&
    typeof v.book === 'number' &&
    Array.isArray(v.lessons) &&
    v.lessons.every((l) => Array.isArray(l.pages) && Array.isArray(l.lines))
  );
}

function readStored(
  storage: Storage | null,
  course: string,
  book: number
): BookSync | null {
  try {
    const raw = storage?.getItem(storageKey(course, book));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isBookSync(parsed) ? parsed : null;
  } catch (error) {
    // Malformed JSON or storage that refuses reading: no kept copy.
    if (!(error instanceof SyntaxError)) {
      log.warn('could not read kept book sync', { error: String(error) });
    }
    return null;
  }
}

/** The sync of a book: from the API, else the copy kept on the device, else none. */
export async function loadBookSync(
  course: string,
  book: number,
  {
    fetchImpl = (...args) => fetch(...args),
    storage = deviceStorage(),
  }: { fetchImpl?: typeof fetch; storage?: Storage | null } = {}
): Promise<BookSync | null> {
  try {
    const res = await fetchImpl(`/api/v1/book-sync/${course}/${book}`, {
      credentials: 'omit',
    });
    if (res.ok) {
      const body: unknown = await res.json();
      if (isBookSync(body)) {
        try {
          storage?.setItem(storageKey(course, book), JSON.stringify(body));
        } catch (error) {
          // Storage full or blocked: the fresh answer still counts, only offline use is lost.
          log.warn('could not keep book sync', { error: String(error) });
        }
        return body;
      }
      log.warn('unexpected answer', { course, book });
    }
  } catch (error) {
    // Offline or no API (the app without a server): the kept copy, if any.
    log.info('book sync not reachable', { error: String(error) });
  }
  return readStored(storage, course, book);
}

/** The page the recording is on at `t` seconds: the last page that started by then. */
export function pageAt(pages: readonly PageStart[], t: number): number | null {
  let found: number | null = null;
  for (const p of pages) {
    if (p.at > t) break;
    found = p.page;
  }
  return found;
}

/** The index of the line read at `t` seconds, or null between lines. */
export function lineAt(lines: readonly SyncLine[], t: number): number | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.start > t) break;
    if (t < line.end) return i;
  }
  return null;
}

/** Saves a lesson's sync (admins); `revision` is the one the edit started from (0: new). */
export function saveLessonSync(
  course: string,
  book: number,
  lesson: number,
  body: { revision: number; pages: PageStart[]; lines: SyncLine[] },
  fetchImpl: typeof fetch = (...args) => fetch(...args)
): Promise<ApiResult<{ revision: number }>> {
  return apiRequest(
    fetchImpl,
    `/api/v1/book-sync/${course}/${book}/${lesson}`,
    { method: 'PUT', body: JSON.stringify(body) },
    'bookSync'
  );
}

/** One lesson's sync and how to replace it after a save. */
export function useLessonSync(
  course: string,
  book: number,
  lesson: number
): {
  sync: LessonSync | null;
  /** The answer (or the kept copy) has arrived; `sync` stays null for a lesson without one. */
  loaded: boolean;
  replace: (sync: LessonSync) => void;
} {
  const [state, setState] = useState<{ sync: LessonSync | null; loaded: boolean }>({
    sync: null,
    loaded: false,
  });
  useEffect(() => {
    let alive = true;
    setState({ sync: null, loaded: false });
    void loadBookSync(course, book).then((all) => {
      if (!alive) return;
      setState({
        sync: all?.lessons.find((l) => l.lesson === lesson) ?? null,
        loaded: true,
      });
    });
    return () => {
      alive = false;
    };
  }, [course, book, lesson]);
  const replace = useCallback(
    (next: LessonSync) => setState({ sync: next, loaded: true }),
    []
  );
  return { ...state, replace };
}
