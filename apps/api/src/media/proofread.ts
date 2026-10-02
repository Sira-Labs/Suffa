/**
 * Transcript corrections (story 11.4, owner feedback 2026-09-26): speech recognition writes
 * Arabic that was spoken without sharp stress in Latin letters ("Hather Beiton" for
 * «هٰذا بَيْتٌ») or mishears it. An EU model reads the transcript piece by piece and proposes
 * corrections for exactly those lines; every line that is already right stays untouched.
 * Corrections wait as suggestions until the teacher accepts them.
 */
import { z } from 'zod';
import type { Cue } from './interactive.js';
import type { CourseId } from '@suffa/engagement';
import { courseBook } from '../tutor/course.js';

export const PROOFREAD_TASK = 'recording.proofread';
/** Transcript text per model call: small pieces keep the answers short and complete. */
const PIECE_CHARS = 8_000;
/** Whole recordings up to about four hours; later lines are not proofread. */
const MAX_PIECES = 30;

export interface Fix {
  /** Index of the cue in the transcript at the time of the run. */
  cue: number;
  before: string;
  after: string;
}

export const PROOFREAD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fixes'],
  properties: {
    fixes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['line', 'text'],
        properties: {
          line: { type: 'integer', description: 'Number of the line in brackets.' },
          text: { type: 'string', description: 'The whole corrected line.' },
        },
      },
    },
  },
} as const;

const Raw = z.object({
  fixes: z.array(z.object({ line: z.number().int(), text: z.string() })).max(400),
});

/** The proofreading rules for a class of the given course (byte-stable per course). */
export const proofreadPrompt = (
  course: CourseId
) => `You proofread the automatic transcript of a recorded Arabic lesson for German-speaking adult beginners (Modern Standard Arabic; the class follows ${courseBook(course)}). The teacher explains in German and speaks Arabic words and sentences.

The speech recognition sometimes wrote spoken Arabic in Latin letters or German-sounding spelling, e.g. "Hather Beiton" for هٰذَا بَيْتٌ, "Ma hada" for مَا هٰذَا, "Ana ismi" for أَنَا اسْمِي, or misheard an Arabic word.

Each line comes as "[number] text". Return only the lines that need a fix:
- write the Arabic in Arabic letters with full vowel signs (tashkīl);
- keep the German words, the order and everything else of the line as it is;
- return the whole corrected line.
Leave out every line that is already right, is German only, or where you are not sure what was said. Never translate, summarise or add anything.`;

/** The transcript in pieces of numbered lines ("[index] text"), each piece at most PIECE_CHARS. */
export function transcriptPieces(cues: readonly Cue[]): string[] {
  const pieces: string[] = [];
  let current = '';
  for (let i = 0; i < cues.length; i++) {
    const line = `[${i}] ${cues[i]!.text}\n`;
    if (current && current.length + line.length > PIECE_CHARS) {
      pieces.push(current);
      if (pieces.length === MAX_PIECES) return pieces;
      current = '';
    }
    current += line;
  }
  if (current) pieces.push(current);
  return pieces;
}

const ARABIC = /[؀-ۿ]/;

/**
 * Model output → corrections worth showing: a known line, really changed, with Arabic
 * letters in it, and not rewritten beyond recognition (a correction, not a new text).
 */
export function toFixes(raw: unknown, cues: readonly Cue[]): Fix[] {
  const parsed = Raw.parse(raw);
  const seen = new Set<number>();
  const out: Fix[] = [];
  for (const f of parsed.fixes) {
    const cue = cues[f.line];
    if (!cue || seen.has(f.line)) continue;
    const after = f.text.trim().replace(/^\[\d+\]\s*/, '');
    if (!after || after === cue.text || after.length > 1000) continue;
    if (!ARABIC.test(after)) continue;
    if (after.length > cue.text.length * 2 + 40) continue;
    seen.add(f.line);
    out.push({ cue: f.line, before: cue.text, after });
  }
  return out;
}
