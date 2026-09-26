/**
 * Lesson summaries from a recording's transcript: what the lesson was about, the main points,
 * new vocabulary and grammar. The model runs on an EU provider (Mistral, migration 0025);
 * learners see a summary only after the teacher has read and published it.
 */
import type pg from 'pg';
import type { Logger } from 'pino';
import { z } from 'zod';
import { LlmError, RouteUnavailableError } from '@suffa/llm';
import { AiQuotaError, type AiGateway } from '../ai/gateway.js';
import type { InteractiveRepository } from './interactive.js';
import type { MediaRepository } from './repository.js';
import { transcriptText, type RunStatus } from './suggestions.js';

export const SUMMARY_TASK = 'recording.summarize';

export const LessonSummary = z
  .object({
    overview: z.string().trim().min(1).max(2000),
    points: z.array(z.string().trim().min(1).max(300)).max(10),
    vocabulary: z
      .array(
        z
          .object({
            ar: z.string().trim().min(1).max(80),
            de: z.string().trim().min(1).max(120),
          })
          .strict()
      )
      .max(20),
    grammar: z.array(z.string().trim().min(1).max(300)).max(8),
  })
  .strict();
export type LessonSummary = z.infer<typeof LessonSummary>;

export interface SummaryRecord {
  status: RunStatus;
  summary: LessonSummary | null;
  error: string | null;
  requestedBy: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface SummaryRepository {
  get(mediaId: string): Promise<SummaryRecord | null>;
  setRun(
    mediaId: string,
    status: RunStatus,
    extra?: { requestedBy?: string; error?: string }
  ): Promise<void>;
  /** Moves a queued run to running; false when another job already took it. */
  claim(mediaId: string): Promise<boolean>;
  /** Stores a new summary; it starts unpublished. */
  save(mediaId: string, summary: LessonSummary, model: string): Promise<void>;
  /** Publishes or hides the summary; false when there is no ready summary. */
  publish(mediaId: string, published: boolean, by: string): Promise<boolean>;
}

export class PgSummaryRepository implements SummaryRepository {
  constructor(private readonly pool: pg.Pool) {}

  async get(mediaId: string): Promise<SummaryRecord | null> {
    const { rows } = await this.pool.query(
      `select status, summary, error, requested_by, published_at, updated_at
         from media_summaries where media_id = $1`,
      [mediaId]
    );
    const r = rows[0];
    if (!r) return null;
    const parsed = LessonSummary.safeParse(r.summary);
    return {
      status: r.status as RunStatus,
      summary: parsed.success ? parsed.data : null,
      error: r.error as string | null,
      requestedBy: r.requested_by as string | null,
      publishedAt: r.published_at ? (r.published_at as Date).toISOString() : null,
      updatedAt: (r.updated_at as Date).toISOString(),
    };
  }

  async setRun(
    mediaId: string,
    status: RunStatus,
    extra: { requestedBy?: string; error?: string } = {}
  ): Promise<void> {
    await this.pool.query(
      `insert into media_summaries (media_id, status, requested_by, error, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (media_id) do update set status = excluded.status,
         requested_by = coalesce(excluded.requested_by, media_summaries.requested_by),
         error = excluded.error, updated_at = now()`,
      [mediaId, status, extra.requestedBy ?? null, extra.error ?? null]
    );
  }

  async claim(mediaId: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update media_summaries set status = 'running', updated_at = now()
        where media_id = $1 and status = 'queued'`,
      [mediaId]
    );
    return (rowCount ?? 0) > 0;
  }

  async save(mediaId: string, summary: LessonSummary, model: string): Promise<void> {
    // A new summary is unpublished until the teacher has read it.
    await this.pool.query(
      `update media_summaries set status = 'ready', summary = $2::jsonb, model = $3,
         error = null, published_at = null, published_by = null, updated_at = now()
        where media_id = $1`,
      [mediaId, JSON.stringify(summary), model]
    );
  }

  async publish(mediaId: string, published: boolean, by: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(
      `update media_summaries
          set published_at = case when $2 then now() else null end,
              published_by = case when $2 then $3::uuid else null end,
              updated_at = now()
        where media_id = $1 and status = 'ready' and summary is not null`,
      [mediaId, published, by]
    );
    return (rowCount ?? 0) > 0;
  }
}

export const SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['overview', 'points', 'vocabulary', 'grammar'],
  properties: {
    overview: {
      type: 'string',
      description: 'What the lesson was about, in German, 3–6 sentences.',
    },
    points: {
      type: 'array',
      description: 'The main things a learner should take away, in German (3–8).',
      items: { type: 'string' },
    },
    vocabulary: {
      type: 'array',
      description: 'Important Arabic words of the lesson (up to 15), vocalised.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ar', 'de'],
        properties: {
          ar: { type: 'string', description: 'Arabic word with full tashkīl.' },
          de: { type: 'string', description: 'German meaning.' },
        },
      },
    },
    grammar: {
      type: 'array',
      description: 'Grammar points explained in the lesson, in German (0–5).',
      items: { type: 'string' },
    },
  },
} as const;

const PROMPT = `You summarise a recorded Arabic lesson for the teacher's adult learners (German speakers, Modern Standard Arabic, course "al-ʿArabiyya bayna yadayk"). You get the transcript with timestamps in seconds; the teacher may speak German and Arabic.

Write in German:
- overview: what the lesson was about, 3–6 sentences;
- points: 3–8 things a learner should take away;
- vocabulary: up to 15 important Arabic words that were taught, with full vocalisation (tashkīl) and their German meaning;
- grammar: the grammar points that were explained (may be empty).

Only use what the transcript says; do not add content from outside the lesson. The transcript comes from speech recognition and may contain mistakes: leave out what you cannot make sense of. Arabic in Arabic letters only.`;

/** Model output → a summary within the limits (overlong lists are cut, not refused). */
export function toSummary(raw: unknown): LessonSummary {
  const data = z
    .object({
      overview: z.string(),
      points: z.array(z.string()),
      vocabulary: z.array(z.object({ ar: z.string(), de: z.string() })),
      grammar: z.array(z.string()),
    })
    .parse(raw);
  return LessonSummary.parse({
    overview: data.overview.trim().slice(0, 2000),
    points: data.points
      .map((p) => p.trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 10),
    vocabulary: data.vocabulary
      .map((v) => ({ ar: v.ar.trim().slice(0, 80), de: v.de.trim().slice(0, 120) }))
      .filter((v) => v.ar && v.de)
      .slice(0, 20),
    grammar: data.grammar
      .map((g) => g.trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 8),
  });
}

/** Worker step: the summary of one recording (queued by the teacher). */
export async function summarizeRecording(
  deps: {
    gateway: AiGateway;
    summaries: SummaryRepository;
    media: Pick<MediaRepository, 'byId'>;
    interactive: Pick<InteractiveRepository, 'transcript' | 'aiEnabled'>;
    log: Pick<Logger, 'info' | 'warn'>;
  },
  mediaId: string
): Promise<void> {
  const record = await deps.summaries.get(mediaId);
  const item = await deps.media.byId(mediaId);
  if (!record || record.status !== 'queued' || !item || !record.requestedBy) return;
  // Only one job calls the (paid) model for a run, even if pg-boss retries or it is queued twice.
  if (!(await deps.summaries.claim(mediaId))) return;
  const transcript = await deps.interactive.transcript(mediaId);
  if (transcript?.status !== 'ready' || transcript.cues.length === 0) {
    await deps.summaries.setRun(mediaId, 'failed', { error: 'no transcript' });
    return;
  }
  // The class switch is checked again: it may have been turned off after queueing.
  if (!(await deps.interactive.aiEnabled(item.classId))) {
    await deps.summaries.setRun(mediaId, 'failed', {
      error: 'AI is switched off for this class',
    });
    return;
  }
  try {
    const result = await deps.gateway.complete(
      { id: record.requestedBy, role: 'teacher' },
      SUMMARY_TASK,
      {
        system: [{ text: PROMPT, cache: true }],
        messages: [
          {
            role: 'user',
            content: `Recording "${item.title}".\n\nTranscript:\n${transcriptText(transcript.cues)}`,
          },
        ],
        jsonSchema: SUMMARY_SCHEMA as unknown as Record<string, unknown>,
      }
    );
    await deps.summaries.save(mediaId, toSummary(JSON.parse(result.text)), result.model);
    deps.log.info({ mediaId, model: result.model }, 'media.summarized');
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'failed';
    await deps.summaries.setRun(mediaId, 'failed', { error: message });
    deps.log.warn({ mediaId, err: error }, 'media.summarize_failed');
    const expected =
      error instanceof SyntaxError ||
      error instanceof z.ZodError ||
      error instanceof LlmError ||
      error instanceof RouteUnavailableError ||
      error instanceof AiQuotaError;
    if (!expected) throw error;
  }
}
