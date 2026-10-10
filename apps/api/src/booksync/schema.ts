/**
 * How the book follows the author's recording (Medina course): when each page starts and,
 * once marked, where each line sits on its page image and when it is read. Times are seconds
 * into the lesson's recording; boxes are fractions of the page image ([x, y, w, h], 0–1), so
 * they hold at any image size. No book text is stored (ADR-0023).
 */
import { z } from 'zod';

/** A lesson recording is at most a few hours; this bounds bad input. */
export const MAX_SECONDS = 6 * 60 * 60;
export const MAX_PAGE = 2000;
export const MAX_PAGES = 200;
export const MAX_LINES = 3000;

const seconds = z.number().finite().min(0).max(MAX_SECONDS);
const page = z.number().int().min(1).max(MAX_PAGE);
const fraction = z.number().finite().min(0).max(1);

const PageStart = z.object({ page, at: seconds }).strict();
const Line = z
  .object({
    page,
    box: z.tuple([fraction, fraction, fraction, fraction]),
    start: seconds,
    end: seconds,
  })
  .strict();

export const BookSyncSchema = z
  .object({
    pages: z.array(PageStart).max(MAX_PAGES),
    lines: z.array(Line).max(MAX_LINES).default([]),
  })
  .strict();

export type BookSyncData = z.output<typeof BookSyncSchema>;

export type ValidationResult =
  | { ok: true; data: BookSyncData }
  | { ok: false; issues: string[] };

// Hundredths of a second and ten-thousandths of a page are finer than anyone can tell apart.
const roundTime = (s: number) => Math.round(s * 100) / 100;
const roundFraction = (f: number) => Math.round(f * 10000) / 10000;

/**
 * Checks the shape and the rules across entries: page starts in order of time, lines in order
 * of their start, each line ending after it starts and its box inside the page.
 */
export function validateBookSync(input: unknown): ValidationResult {
  const parsed = BookSyncSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues
        .slice(0, 20)
        .map((i) => `${i.path.join('.') || 'body'}: ${i.message}`),
    };
  }
  const data: BookSyncData = {
    pages: parsed.data.pages.map((p) => ({ page: p.page, at: roundTime(p.at) })),
    lines: parsed.data.lines.map((l) => ({
      page: l.page,
      box: l.box.map(roundFraction) as [number, number, number, number],
      start: roundTime(l.start),
      end: roundTime(l.end),
    })),
  };
  const issues: string[] = [];
  data.pages.forEach((p, i) => {
    const before = data.pages[i - 1];
    if (before && p.at <= before.at)
      issues.push(`pages.${i}: starts before the page before`);
  });
  data.lines.forEach((l, i) => {
    if (l.end <= l.start) issues.push(`lines.${i}: ends before it starts`);
    const [x, y, w, h] = l.box;
    if (w <= 0 || h <= 0 || x + w > 1.0001 || y + h > 1.0001) {
      issues.push(`lines.${i}: box outside the page`);
    }
    const before = data.lines[i - 1];
    if (before && l.start < before.start) {
      issues.push(`lines.${i}: starts before the line before`);
    }
  });
  return issues.length > 0
    ? { ok: false, issues: issues.slice(0, 20) }
    : { ok: true, data };
}
