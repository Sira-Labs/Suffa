/**
 * Meanings in further languages (story 18.4, ADR-0031). The LLM drafts the meaning of each
 * word of a unit in Turkish, Italian, Bosnian or Albanian; a teacher approves, corrects or
 * rejects every single one. The drafts are kept apart from the unit's draft and nothing here
 * feeds a content bundle: no learner sees a meaning from this table.
 */
import { LlmError, RouteUnavailableError } from '@suffa/llm';
import type pg from 'pg';
import { z } from 'zod';
import { AiQuotaError, type AiGateway } from '../ai/gateway.js';
import { writeAudit } from '../audit/log.js';
import { inTransaction } from '../db/transaction.js';
import type { ContentActor, ContentRepository } from './repository.js';
import { TRANSLATE_TASK } from './translate.js';

/** The languages meanings are drafted in, with the name the model is given. */
export const MEANING_DRAFT_LANGUAGES = {
  tr: 'Turkish',
  it: 'Italian',
  bs: 'Bosnian',
  sq: 'Albanian',
} as const;
export type MeaningDraftLanguage = keyof typeof MEANING_DRAFT_LANGUAGES;

export function isMeaningDraftLanguage(value: string): value is MeaningDraftLanguage {
  return Object.hasOwn(MEANING_DRAFT_LANGUAGES, value);
}

export type MeaningDraftStatus = 'draft' | 'approved' | 'rejected';
export const MAX_MEANING_LENGTH = 500;
/** Words per request to the model; a unit with more is drafted by running the draft again. */
export const MAX_WORDS_PER_DRAFT = 120;

export interface MeaningDraft {
  id: string;
  unitId: string;
  wordId: string;
  language: MeaningDraftLanguage;
  sourceDe: string;
  text: string;
  model: string;
  status: MeaningDraftStatus;
  draftedBy: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface NewMeaningDraft {
  wordId: string;
  sourceDe: string;
  text: string;
}

/** `seen` is the draft text the reviewer had before them when deciding. */
export type ReviewDecision =
  | { decision: 'approved'; seen: string; text?: string }
  | { decision: 'rejected'; seen: string };

export type ReviewResult =
  | { ok: true; draft: MeaningDraft }
  | {
      ok: false;
      reason: 'not_found' | 'own_draft' | 'draft_changed' | 'source_changed';
    };

export interface MeaningDraftRepository {
  list(unitId: string, language: MeaningDraftLanguage): Promise<MeaningDraft[]>;
  /**
   * Stores drafts for words that have none, whose draft was rejected or whose German changed
   * since. A draft waiting for review and an approved meaning of the same German stay.
   */
  saveDrafts(
    unitId: string,
    language: MeaningDraftLanguage,
    drafts: NewMeaningDraft[],
    model: string,
    actor: ContentActor
  ): Promise<number>;
  /**
   * A reviewer's decision on one draft. Nobody decides on a draft they ordered themselves
   * (`own_draft`), nor on text other than the one they saw (`draft_changed`: it was drafted
   * again meanwhile). A meaning drafted from German the word no longer has cannot be
   * approved (`source_changed`).
   */
  review(
    id: string,
    actor: ContentActor,
    decision: ReviewDecision
  ): Promise<ReviewResult>;
}

interface Row {
  id: string;
  unit_id: string;
  word_id: string;
  language: MeaningDraftLanguage;
  source_de: string;
  text: string;
  model: string;
  status: MeaningDraftStatus;
  drafted_by: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
}

const COLUMNS = `id, unit_id, word_id, language, source_de, text, model, status, drafted_by,
  reviewed_by, reviewed_at`;

const toDraft = (row: Row): MeaningDraft => ({
  id: row.id,
  unitId: row.unit_id,
  wordId: row.word_id,
  language: row.language,
  sourceDe: row.source_de,
  text: row.text,
  model: row.model,
  status: row.status,
  draftedBy: row.drafted_by,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : null,
});

export class PgMeaningDraftRepository implements MeaningDraftRepository {
  constructor(private readonly pool: pg.Pool) {}

  async list(unitId: string, language: MeaningDraftLanguage): Promise<MeaningDraft[]> {
    const { rows } = await this.pool.query<Row>(
      `select ${COLUMNS} from content_meaning_drafts
        where unit_id = $1 and language = $2 order by word_id`,
      [unitId, language]
    );
    return rows.map(toDraft);
  }

  async saveDrafts(
    unitId: string,
    language: MeaningDraftLanguage,
    drafts: NewMeaningDraft[],
    model: string,
    actor: ContentActor
  ): Promise<number> {
    if (drafts.length === 0) return 0;
    return inTransaction(this.pool, async (db) => {
      let saved = 0;
      for (const draft of drafts) {
        const result = await db.query(
          `insert into content_meaning_drafts
             (unit_id, word_id, language, source_de, text, model, drafted_by)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (unit_id, word_id, language) do update
             set source_de = excluded.source_de, text = excluded.text,
                 model = excluded.model, status = 'draft',
                 drafted_by = excluded.drafted_by, drafted_at = now(),
                 reviewed_by = null, reviewed_at = null
           where content_meaning_drafts.status = 'rejected'
              or content_meaning_drafts.source_de <> excluded.source_de`,
          [unitId, draft.wordId, language, draft.sourceDe, draft.text, model, actor.id]
        );
        saved += result.rowCount ?? 0;
      }
      if (saved > 0) {
        await writeAudit(db, {
          actorId: actor.id,
          action: 'content.meanings_drafted',
          targetType: 'content_unit',
          targetId: unitId,
          details: { language, drafted: saved, model },
          ipAddress: actor.ipAddress,
        });
      }
      return saved;
    });
  }

  async review(
    id: string,
    actor: ContentActor,
    decision: ReviewDecision
  ): Promise<ReviewResult> {
    return inTransaction(this.pool, async (db) => {
      const found = await db.query<Row>(
        `select ${COLUMNS} from content_meaning_drafts where id = $1 for update`,
        [id]
      );
      const row = found.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.drafted_by === actor.id) return { ok: false, reason: 'own_draft' };
      if (row.text !== decision.seen) return { ok: false, reason: 'draft_changed' };
      if (decision.decision === 'approved') {
        // The unit stays locked until the decision is stored: an edit of the German
        // cannot slip in between this look and the approval.
        const word = await db.query<{ de: string }>(
          `select word->>'de' as de
             from content_units, jsonb_array_elements(draft->'vokabeln') as word
            where id = $1 and word->>'id' = $2
              for share of content_units`,
          [row.unit_id, row.word_id]
        );
        if (word.rows[0]?.de !== row.source_de) {
          return { ok: false, reason: 'source_changed' };
        }
      }
      const text =
        decision.decision === 'approved' && decision.text ? decision.text : row.text;
      const updated = await db.query<Row>(
        `update content_meaning_drafts
            set status = $2, text = $3, reviewed_by = $4, reviewed_at = now()
          where id = $1 returning ${COLUMNS}`,
        [id, decision.decision, text, actor.id]
      );
      await writeAudit(db, {
        actorId: actor.id,
        action: 'content.meaning_reviewed',
        targetType: 'content_meaning_draft',
        targetId: id,
        details: {
          unitId: row.unit_id,
          wordId: row.word_id,
          language: row.language,
          decision: decision.decision,
          corrected: text !== row.text,
          // The wording itself: a later draft run replaces the row when the German changes.
          text,
        },
        ipAddress: actor.ipAddress,
      });
      return { ok: true, draft: toDraft(updated.rows[0]!) };
    });
  }
}

/** A word of the unit that needs a draft in the language: none yet, rejected, or stale. */
export interface WordToDraft {
  place: string;
  ar: string;
  de: string;
}

export function wordsToDraft(
  words: readonly { id: string; ar: string; de: string }[],
  existing: readonly MeaningDraft[]
): WordToDraft[] {
  const byWord = new Map(existing.map((draft) => [draft.wordId, draft]));
  return words
    .filter((word) => {
      const draft = byWord.get(word.id);
      return !draft || draft.status === 'rejected' || draft.sourceDe !== word.de;
    })
    .map((word) => ({ place: word.id, ar: word.ar, de: word.de }));
}

const systemPrompt = (
  language: string
) => `You translate the German glosses of an Arabic course (Modern Standard Arabic) into ${language} for ${language}-speaking Muslim learners in Europe.
Each item is a word with its Arabic and its German gloss. Give the meaning of the Arabic as the German gloss gives it:
- a short gloss like a dictionary entry, in standard ${language} spelling with its own letters and diacritics.
- keep alternatives separated by ", " or "; " as in the German, keep notes in parentheses, verbs in the dictionary form of ${language}.
- for words of worship and Muslim life use the term Muslims who speak ${language} use themselves.
Do not add explanations. Do not answer in German or English.
Answer only with JSON: {"translations": [{"place": "<place>", "text": "<${language}>"}]}, one entry per item, places exactly as given.`;

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { place: { type: 'string' }, text: { type: 'string' } },
        required: ['place', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
} as const;

const Answer = z.object({
  translations: z
    .array(z.object({ place: z.string().max(200), text: z.string().max(4000) }))
    .max(MAX_WORDS_PER_DRAFT * 2),
});

export type DraftMeaningsResult =
  | { ok: true; drafted: number; remaining: number; model: string }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'nothing_to_translate'
        | 'ai_unavailable'
        | 'ai_quota'
        | 'ai_failed';
    };

export interface DraftMeaningsDeps {
  content: Pick<ContentRepository, 'get'>;
  drafts: MeaningDraftRepository;
  gateway: Pick<AiGateway, 'complete'>;
}

/** Drafts the meanings the unit's words still lack in `language` and stores them for review. */
export async function draftMeanings(
  deps: DraftMeaningsDeps,
  actor: ContentActor,
  unitId: string,
  language: MeaningDraftLanguage
): Promise<DraftMeaningsResult> {
  const unit = await deps.content.get(unitId);
  if (!unit) return { ok: false, reason: 'not_found' };
  const missing = wordsToDraft(
    unit.draft.vokabeln,
    await deps.drafts.list(unitId, language)
  );
  if (missing.length === 0) return { ok: false, reason: 'nothing_to_translate' };
  const batch = missing.slice(0, MAX_WORDS_PER_DRAFT);

  let answer: z.infer<typeof Answer>;
  let model: string;
  try {
    const result = await deps.gateway.complete(
      { id: actor.id, role: 'admin' },
      TRANSLATE_TASK,
      {
        system: [{ text: systemPrompt(MEANING_DRAFT_LANGUAGES[language]), cache: true }],
        messages: [
          {
            role: 'user',
            content: JSON.stringify({ title: unit.draft.titel, items: batch }),
          },
        ],
        jsonSchema: ANSWER_SCHEMA as unknown as Record<string, unknown>,
      }
    );
    answer = Answer.parse(JSON.parse(result.text));
    model = result.model;
  } catch (error) {
    if (error instanceof AiQuotaError) return { ok: false, reason: 'ai_quota' };
    if (error instanceof RouteUnavailableError)
      return { ok: false, reason: 'ai_unavailable' };
    if (
      error instanceof LlmError ||
      error instanceof SyntaxError ||
      error instanceof z.ZodError
    ) {
      return { ok: false, reason: 'ai_failed' };
    }
    throw error;
  }

  // Only words that were asked for, once each, and only text that fits: the model cannot
  // touch anything else.
  const asked = new Map(batch.map((word) => [word.place, word]));
  const drafts = new Map<string, NewMeaningDraft>();
  for (const translation of answer.translations) {
    const word = asked.get(translation.place);
    const text = translation.text.trim();
    if (!word || !text || text.length > MAX_MEANING_LENGTH) continue;
    if (!drafts.has(word.place)) {
      drafts.set(word.place, { wordId: word.place, sourceDe: word.de, text });
    }
  }
  if (drafts.size === 0) return { ok: false, reason: 'ai_failed' };
  const drafted = await deps.drafts.saveDrafts(
    unitId,
    language,
    [...drafts.values()],
    model,
    actor
  );
  return { ok: true, drafted, remaining: missing.length - drafts.size, model };
}
