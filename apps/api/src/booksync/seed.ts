/**
 * Suggested page turns and line marks for the Medina book (tools/content/madinah-book-sync.mjs):
 * at start-up every lesson without a sync gets the suggestion, so the book follows the
 * recording right away. A lesson an admin has saved is never touched again; the suggestion is
 * only a start for their corrections. Only boxes and seconds (ADR-0023).
 *
 * The API image copies the file to the same relative path (infra/docker/api.Dockerfile).
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { BookSyncRepository } from './repository.js';
import { validateBookSync } from './schema.js';

/** apps/api/{src,dist}/booksync → apps/web/src/content/courses/madinah/book1-sync.json */
export const DEFAULT_SYNC_SEED = fileURLToPath(
  new URL('../../../web/src/content/courses/madinah/book1-sync.json', import.meta.url)
);

const SeedFile = z.object({
  course: z.string().regex(/^[a-z][a-z0-9-]{0,39}$/),
  book: z.number().int().min(1).max(9),
  lessons: z.array(
    z.object({
      lesson: z.number().int().min(1).max(99),
      pages: z.unknown(),
      lines: z.unknown(),
    })
  ),
});

export interface SeedLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}

/** Inserts the suggestion for every lesson that has no sync yet; returns how many. */
export async function seedBookSync(
  repo: Pick<BookSyncRepository, 'seed'>,
  file: string,
  log: SeedLog
): Promise<number> {
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (
      error instanceof SyntaxError ||
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      log.warn({ file, err: String(error) }, 'book_sync.seed_unreadable');
      return 0;
    }
    throw error;
  }
  const parsed = SeedFile.safeParse(raw);
  if (!parsed.success) {
    log.warn({ file }, 'book_sync.seed_invalid');
    return 0;
  }
  let inserted = 0;
  for (const lesson of parsed.data.lessons) {
    const checked = validateBookSync({ pages: lesson.pages, lines: lesson.lines });
    if (!checked.ok) {
      log.warn(
        { lesson: lesson.lesson, issues: checked.issues },
        'book_sync.seed_lesson_invalid'
      );
      continue;
    }
    if (checked.data.pages.length === 0 && checked.data.lines.length === 0) continue;
    if (
      await repo.seed(parsed.data.course, parsed.data.book, lesson.lesson, checked.data)
    ) {
      inserted++;
    }
  }
  if (inserted > 0) log.info({ inserted, file }, 'book_sync.seeded');
  return inserted;
}
