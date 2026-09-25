/**
 * AI suggestions for a recording (story 11.4): chapters and checkpoints (questions,
 * dictations, word cards) proposed from its transcript. They wait as "pending" until the
 * teacher accepts or dismisses each one; nothing is ever published on its own.
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Logger } from 'pino';
import { z } from 'zod';
import { LlmError, RouteUnavailableError } from '@suffa/llm';
import { AiQuotaError, type AiGateway } from '../ai/gateway.js';
import { foldArabic, type ContentCatalog } from '../tutor/content.js';
import { CheckpointData, type Cue, type InteractiveRepository } from './interactive.js';
import type { MediaRepository } from './repository.js';

export const SUGGEST_TASK = 'recording.suggest';
/** Transcript sent to the model at most (about an hour of speech). */
const MAX_TRANSCRIPT_CHARS = 60_000;

export type RunStatus = 'queued' | 'running' | 'ready' | 'failed';

export interface SuggestionRun {
  status: RunStatus;
  error: string | null;
  updatedAt: string;
}

export type Suggestion =
  | { id: string; kind: 'chapter'; atSec: number; data: { title: string } }
  | { id: string; kind: 'checkpoint'; atSec: number; data: CheckpointData };

export interface Chapter {
  id: string;
  atSec: number;
  title: string;
}

export interface SuggestionRepository {
  run(mediaId: string): Promise<(SuggestionRun & { requestedBy: string | null }) | null>;
  setRun(
    mediaId: string,
    status: RunStatus,
    extra?: { requestedBy?: string; error?: string }
  ): Promise<void>;
  /** Replaces the pending suggestions of a recording (decided ones stay). */
  replacePending(mediaId: string, suggestions: Omit<Suggestion, 'id'>[]): Promise<void>;
  pending(mediaId: string): Promise<Suggestion[]>;
  /** Marks a pending suggestion decided; returns it, or null when there is none. */
  decide(
    mediaId: string,
    id: string,
    decision: 'accepted' | 'dismissed',
    by: string
  ): Promise<Suggestion | null>;
  chapters(mediaId: string): Promise<Chapter[]>;
  addChapter(mediaId: string, atSec: number, title: string, by: string): Promise<Chapter>;
  removeChapter(mediaId: string, id: string): Promise<boolean>;
}

export class PgSuggestionRepository implements SuggestionRepository {
  constructor(private readonly pool: pg.Pool) {}

  async run(mediaId: string) {
    const { rows } = await this.pool.query(
      'select status, error, requested_by, updated_at from media_suggestion_runs where media_id = $1',
      [mediaId]
    );
    const r = rows[0];
    return r
      ? {
          status: r.status as RunStatus,
          error: r.error as string | null,
          requestedBy: r.requested_by as string | null,
          updatedAt: (r.updated_at as Date).toISOString(),
        }
      : null;
  }

  async setRun(
    mediaId: string,
    status: RunStatus,
    extra: { requestedBy?: string; error?: string } = {}
  ) {
    await this.pool.query(
      `insert into media_suggestion_runs (media_id, status, requested_by, error, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (media_id) do update set status = excluded.status,
         requested_by = coalesce(excluded.requested_by, media_suggestion_runs.requested_by),
         error = excluded.error, updated_at = now()`,
      [mediaId, status, extra.requestedBy ?? null, extra.error ?? null]
    );
  }

  async replacePending(mediaId: string, suggestions: Omit<Suggestion, 'id'>[]) {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        "delete from media_suggestions where media_id = $1 and status = 'pending'",
        [mediaId]
      );
      for (const s of suggestions) {
        await client.query(
          `insert into media_suggestions (id, media_id, kind, at_sec, data)
           values ($1, $2, $3, $4, $5::jsonb)`,
          [randomUUID(), mediaId, s.kind, s.atSec, JSON.stringify(s.data)]
        );
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async pending(mediaId: string) {
    const { rows } = await this.pool.query(
      `select id, kind, at_sec, data from media_suggestions
        where media_id = $1 and status = 'pending' order by at_sec, kind`,
      [mediaId]
    );
    return rows.map(
      (r) => ({ id: r.id, kind: r.kind, atSec: r.at_sec, data: r.data }) as Suggestion
    );
  }

  async decide(
    mediaId: string,
    id: string,
    decision: 'accepted' | 'dismissed',
    by: string
  ) {
    const { rows } = await this.pool.query(
      `update media_suggestions set status = $3, decided_by = $4, decided_at = now()
        where media_id = $1 and id = $2 and status = 'pending'
       returning id, kind, at_sec, data`,
      [mediaId, id, decision, by]
    );
    const r = rows[0];
    return r
      ? ({ id: r.id, kind: r.kind, atSec: r.at_sec, data: r.data } as Suggestion)
      : null;
  }

  async chapters(mediaId: string) {
    const { rows } = await this.pool.query(
      'select id, at_sec, title from media_chapters where media_id = $1 order by at_sec',
      [mediaId]
    );
    return rows.map((r) => ({
      id: r.id as string,
      atSec: r.at_sec as number,
      title: r.title as string,
    }));
  }

  async addChapter(mediaId: string, atSec: number, title: string, by: string) {
    const id = randomUUID();
    await this.pool.query(
      `insert into media_chapters (id, media_id, at_sec, title, created_by) values ($1, $2, $3, $4, $5)`,
      [id, mediaId, atSec, title, by]
    );
    return { id, atSec, title };
  }

  async removeChapter(mediaId: string, id: string) {
    const { rows } = await this.pool.query(
      'delete from media_chapters where media_id = $1 and id = $2 returning id',
      [mediaId, id]
    );
    return rows.length > 0;
  }
}

/** Structured output; one flat checkpoint shape (fields a kind does not use stay empty). */
export const SUGGEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['chapters', 'checkpoints'],
  properties: {
    chapters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['atSec', 'title'],
        properties: {
          atSec: { type: 'number' },
          title: { type: 'string', description: 'Short German title of this part.' },
        },
      },
    },
    checkpoints: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['atSec', 'kind', 'question', 'options', 'answer', 'ar', 'de'],
        properties: {
          atSec: { type: 'number', description: 'Right after the moment it is about.' },
          kind: { type: 'string', enum: ['mcq', 'dictation', 'vocab_flash'] },
          question: { type: 'string', description: 'mcq: the question (German).' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: 'mcq: 3–4 options; empty otherwise.',
          },
          answer: {
            type: 'integer',
            description: 'mcq: index of the right option; else 0.',
          },
          ar: {
            type: 'string',
            description:
              'dictation: the Arabic sentence heard; vocab_flash: the word, vocalised.',
          },
          de: {
            type: 'string',
            description: 'vocab_flash: German meaning; dictation: a hint.',
          },
        },
      },
    },
  },
} as const;

const Raw = z.object({
  chapters: z.array(z.object({ atSec: z.number(), title: z.string() })).max(40),
  checkpoints: z
    .array(
      z.object({
        atSec: z.number(),
        kind: z.enum(['mcq', 'dictation', 'vocab_flash']),
        question: z.string(),
        options: z.array(z.string()),
        answer: z.number().int(),
        ar: z.string(),
        de: z.string(),
      })
    )
    .max(40),
});

const PROMPT = `You help an Arabic teacher turn a recorded lesson into an interactive one for adult beginners (Modern Standard Arabic, course "al-ʿArabiyya bayna yadayk"). You get the transcript with timestamps in seconds.

Propose:
- chapters: 3–10 parts of the lesson with a short German title each, at the second the part starts.
- checkpoints: 5–12 moments to pause and check understanding, placed right after what they ask about:
  - "vocab_flash": an important Arabic word just used (vocalised) with its German meaning;
  - "mcq": a short German question about what was just said, 3–4 options, one right;
  - "dictation": a short Arabic sentence just said clearly, for the learner to write (ar), with a German hint (de).
Only use what the transcript says. Arabic with Arabic letters only. Timestamps must lie inside the recording.`;

/** Model output → valid suggestions (anything that would not be a valid checkpoint is dropped). */
export function toSuggestions(
  raw: unknown,
  durationSec: number | null,
  catalog: ContentCatalog | null
): Omit<Suggestion, 'id'>[] {
  const parsed = Raw.parse(raw);
  const inside = (t: number) => t >= 0 && (durationSec === null || t <= durationSec);
  const out: Omit<Suggestion, 'id'>[] = [];
  for (const c of parsed.chapters) {
    const title = c.title.trim().slice(0, 120);
    if (title && inside(c.atSec))
      out.push({ kind: 'chapter', atSec: c.atSec, data: { title } });
  }
  for (const c of parsed.checkpoints) {
    if (!inside(c.atSec)) continue;
    const candidate =
      c.kind === 'mcq'
        ? { kind: 'mcq', question: c.question, options: c.options, answer: c.answer }
        : c.kind === 'dictation'
          ? { kind: 'dictation', prompt: c.de, answer: c.ar }
          : {
              kind: 'vocab_flash',
              ar: c.ar,
              de: c.de,
              contentRef:
                catalog
                  ?.search(c.ar, 5)
                  .find((w) => foldArabic(w.ar) === foldArabic(c.ar))?.id ?? null,
            };
    const data = CheckpointData.safeParse(candidate);
    if (!data.success) continue;
    if (data.data.kind === 'mcq' && data.data.answer >= data.data.options.length)
      continue;
    out.push({ kind: 'checkpoint', atSec: c.atSec, data: data.data });
  }
  return out;
}

export function transcriptText(cues: readonly Cue[]): string {
  let text = '';
  for (const cue of cues) {
    const line = `[${Math.floor(cue.start)}] ${cue.text}\n`;
    if (text.length + line.length > MAX_TRANSCRIPT_CHARS) break;
    text += line;
  }
  return text;
}

/** Worker step: suggestions for one recording (queued by the teacher). */
export async function suggestForRecording(
  deps: {
    gateway: AiGateway;
    suggestions: SuggestionRepository;
    media: Pick<MediaRepository, 'byId'>;
    interactive: Pick<InteractiveRepository, 'transcript' | 'aiEnabled'>;
    catalog: ContentCatalog | null;
    log: Pick<Logger, 'info' | 'warn'>;
  },
  mediaId: string
): Promise<void> {
  const run = await deps.suggestions.run(mediaId);
  const item = await deps.media.byId(mediaId);
  if (!run || run.status !== 'queued' || !item || !run.requestedBy) return;
  const transcript = await deps.interactive.transcript(mediaId);
  if (transcript?.status !== 'ready' || transcript.cues.length === 0) {
    await deps.suggestions.setRun(mediaId, 'failed', { error: 'no transcript' });
    return;
  }
  // The class switch is checked again here: it may have been turned off after queueing.
  if (!(await deps.interactive.aiEnabled(item.classId))) {
    await deps.suggestions.setRun(mediaId, 'failed', {
      error: 'AI is switched off for this class',
    });
    return;
  }
  await deps.suggestions.setRun(mediaId, 'running');
  try {
    const result = await deps.gateway.complete(
      { id: run.requestedBy, role: 'teacher' },
      SUGGEST_TASK,
      {
        system: [{ text: PROMPT, cache: true }],
        messages: [
          {
            role: 'user',
            content: `Recording "${item.title}"${item.durationSec ? `, ${Math.round(item.durationSec)} s long` : ''}.\n\nTranscript:\n${transcriptText(transcript.cues)}`,
          },
        ],
        jsonSchema: SUGGEST_SCHEMA as unknown as Record<string, unknown>,
      }
    );
    const suggestions = toSuggestions(
      JSON.parse(result.text),
      item.durationSec,
      deps.catalog
    );
    await deps.suggestions.replacePending(mediaId, suggestions);
    await deps.suggestions.setRun(mediaId, 'ready');
    deps.log.info({ mediaId, count: suggestions.length }, 'media.suggested');
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'failed';
    await deps.suggestions.setRun(mediaId, 'failed', { error: message });
    deps.log.warn({ mediaId, err: error }, 'media.suggest_failed');
    // Model trouble, quota and malformed output are expected outcomes; anything else is a bug
    // the job runner should report (the run is already marked failed, so a retry is a no-op).
    const expected =
      error instanceof SyntaxError ||
      error instanceof z.ZodError ||
      error instanceof LlmError ||
      error instanceof RouteUnavailableError ||
      error instanceof AiQuotaError;
    if (!expected) throw error;
  }
}
