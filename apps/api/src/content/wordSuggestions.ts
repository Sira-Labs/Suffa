/**
 * Words for Muslims in Europe (story 18.4, ADR-0034). The LLM suggests words from the daily
 * life of Muslims in Europe that a unit's topic calls for and the course does not have; a
 * reviewer accepts each one, as suggested or corrected, or rejects it. An accepted word is
 * written into the unit's draft and goes on from there like any edit; nothing else of this
 * table reaches a unit, a bundle or a learner.
 */
import { LlmError, RouteUnavailableError } from '@suffa/llm';
import type pg from 'pg';
import { z } from 'zod';
import { AiQuotaError, type AiGateway } from '../ai/gateway.js';
import { writeAudit } from '../audit/log.js';
import { inTransaction } from '../db/transaction.js';
import type { ContentActor, ContentRepository } from './repository.js';
import { validateUnitContent, VocabSchema, type Vocab } from './schema.js';

/** The admin's quality-critical authoring task (technical spec, model routing). */
export const SUGGEST_TASK = 'content.author-assist';
/** Words asked for per run; a unit that should get more is run again. */
export const WORDS_PER_RUN = 12;

export type SuggestionStatus = 'suggested' | 'accepted' | 'rejected';

/** The fields of a word a suggestion carries and a reviewer may correct. */
export const SuggestedWordSchema = VocabSchema.pick({
  ar: true,
  tr: true,
  de: true,
  wurzel: true,
  plural: true,
});
export type SuggestedWord = z.infer<typeof SuggestedWordSchema>;

export interface WordSuggestion extends SuggestedWord {
  id: string;
  unitId: string;
  reason: string | null;
  model: string;
  status: SuggestionStatus;
  suggestedBy: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
  /** The word's id in the unit, once accepted. */
  wordId: string | null;
}

export type NewSuggestion = SuggestedWord & { reason: string | null };

export type Decision =
  | { decision: 'accepted'; word?: Partial<SuggestedWord> }
  | { decision: 'rejected' };

export type DecisionResult =
  | { ok: true; suggestion: WordSuggestion }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'own_suggestion'
        | 'already_decided'
        | 'duplicate_word'
        | 'unit_changed';
    }
  | { ok: false; reason: 'invalid_word'; issues: string[] };

/**
 * Arabic as it is compared: without vowel signs, tatweel and the article, hamza carriers
 * folded. Two spellings of one word must not both end up in the course.
 */
export function plainArabic(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .trim()
    .replace(/^ال(?=\S{2,})/, '');
}

/**
 * An id for a new word, in the style of the unit files (`v-salam` for „as-salām“): from the
 * transliteration, ASCII only, and none of `taken`.
 */
export function wordIdFor(transliteration: string, taken: ReadonlySet<string>): string {
  const slug =
    transliteration
      .normalize('NFKD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      // The article, also assimilated (as-, ar-, ash-): ids name the word itself.
      .replace(/^a[a-z]{1,2}-(?=[a-z0-9])/, '')
      .slice(0, 60) || 'wort';
  for (let n = 1; ; n++) {
    const id = n === 1 ? `v-${slug}` : `v-${slug}-${n}`;
    if (!taken.has(id)) return id;
  }
}

interface Row {
  id: string;
  unit_id: string;
  ar: string;
  tr: string;
  de: string;
  wurzel: string;
  plural: string | null;
  reason: string | null;
  model: string;
  status: SuggestionStatus;
  suggested_by: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  word_id: string | null;
}

const COLUMNS = `id, unit_id, ar, tr, de, wurzel, plural, reason, model, status, suggested_by,
  decided_by, decided_at, word_id`;

const toSuggestion = (row: Row): WordSuggestion => ({
  id: row.id,
  unitId: row.unit_id,
  ar: row.ar,
  tr: row.tr,
  de: row.de,
  wurzel: row.wurzel,
  plural: row.plural,
  reason: row.reason,
  model: row.model,
  status: row.status,
  suggestedBy: row.suggested_by,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
  wordId: row.word_id,
});

export interface WordSuggestionRepository {
  list(unitId: string): Promise<WordSuggestion[]>;
  /** Stores suggestions the unit does not have yet (by plain Arabic); returns how many. */
  save(
    unitId: string,
    suggestions: NewSuggestion[],
    model: string,
    actor: ContentActor
  ): Promise<number>;
  /**
   * Locks a suggestion for a decision and runs `decide` with it; what it returns is stored.
   * Nobody decides on a suggestion they ordered themselves, nor on a decided one.
   */
  decide(
    id: string,
    actor: ContentActor,
    decide: (
      suggestion: WordSuggestion
    ) => Promise<
      | { ok: true; status: 'accepted'; word: Vocab }
      | { ok: true; status: 'rejected' }
      | Exclude<DecisionResult, { ok: true }>
    >
  ): Promise<DecisionResult>;
}

export class PgWordSuggestionRepository implements WordSuggestionRepository {
  constructor(private readonly pool: pg.Pool) {}

  async list(unitId: string): Promise<WordSuggestion[]> {
    const { rows } = await this.pool.query<Row>(
      `select ${COLUMNS} from content_word_suggestions
        where unit_id = $1 order by suggested_at, ar_plain`,
      [unitId]
    );
    return rows.map(toSuggestion);
  }

  async save(
    unitId: string,
    suggestions: NewSuggestion[],
    model: string,
    actor: ContentActor
  ): Promise<number> {
    if (suggestions.length === 0) return 0;
    return inTransaction(this.pool, async (db) => {
      let saved = 0;
      for (const s of suggestions) {
        const result = await db.query(
          `insert into content_word_suggestions
             (unit_id, ar, tr, de, wurzel, plural, reason, ar_plain, model, suggested_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           on conflict (unit_id, ar_plain) do nothing`,
          [
            unitId,
            s.ar,
            s.tr,
            s.de,
            s.wurzel,
            s.plural ?? null,
            s.reason,
            plainArabic(s.ar),
            model,
            actor.id,
          ]
        );
        saved += result.rowCount ?? 0;
      }
      if (saved > 0) {
        await writeAudit(db, {
          actorId: actor.id,
          action: 'content.words_suggested',
          targetType: 'content_unit',
          targetId: unitId,
          details: { suggested: saved, model },
          ipAddress: actor.ipAddress,
        });
      }
      return saved;
    });
  }

  async decide(
    id: string,
    actor: ContentActor,
    decide: Parameters<WordSuggestionRepository['decide']>[2]
  ): Promise<DecisionResult> {
    return inTransaction(this.pool, async (db) => {
      const found = await db.query<Row>(
        `select ${COLUMNS} from content_word_suggestions where id = $1 for update`,
        [id]
      );
      const row = found.rows[0];
      if (!row) return { ok: false, reason: 'not_found' };
      if (row.suggested_by === actor.id) return { ok: false, reason: 'own_suggestion' };
      if (row.status !== 'suggested') return { ok: false, reason: 'already_decided' };

      const outcome = await decide(toSuggestion(row));
      if (!outcome.ok) return outcome;
      const word = outcome.status === 'accepted' ? outcome.word : null;
      const updated = await db.query<Row>(
        `update content_word_suggestions
            set status = $2, decided_by = $3, decided_at = now(), word_id = $4,
                ar = coalesce($5, ar), tr = coalesce($6, tr), de = coalesce($7, de),
                wurzel = coalesce($8, wurzel), plural = $9
          where id = $1 returning ${COLUMNS}`,
        [
          id,
          outcome.status,
          actor.id,
          word?.id ?? null,
          word?.ar ?? null,
          word?.tr ?? null,
          word?.de ?? null,
          word?.wurzel ?? null,
          word ? (word.plural ?? null) : row.plural,
        ]
      );
      await writeAudit(db, {
        actorId: actor.id,
        action: 'content.word_suggestion_decided',
        targetType: 'content_word_suggestion',
        targetId: id,
        details: {
          unitId: row.unit_id,
          decision: outcome.status,
          wordId: word?.id ?? null,
          ar: word?.ar ?? row.ar,
          de: word?.de ?? row.de,
          corrected: word
            ? word.ar !== row.ar ||
              word.tr !== row.tr ||
              word.de !== row.de ||
              word.wurzel !== row.wurzel ||
              (word.plural ?? null) !== row.plural
            : false,
        },
        ipAddress: actor.ipAddress,
      });
      return { ok: true, suggestion: toSuggestion(updated.rows[0]!) };
    });
  }
}

export interface WordSuggestionDeps {
  content: Pick<ContentRepository, 'get' | 'list' | 'saveDraft'>;
  suggestions: WordSuggestionRepository;
}

/** Every word of the course as plain Arabic, from the drafts (what editors work on). */
async function courseWords(
  content: Pick<ContentRepository, 'get' | 'list'>,
  course: string
): Promise<Set<string>> {
  const words = new Set<string>();
  for (const summary of await content.list()) {
    if (summary.course !== course) continue;
    const unit = await content.get(summary.id);
    for (const word of unit?.draft.vokabeln ?? []) words.add(plainArabic(word.ar));
  }
  return words;
}

/**
 * A reviewer's decision. Accepting writes the word (as suggested, or with the reviewer's
 * corrections) into the unit's draft as its next revision; the unit then needs its usual
 * check and publish. A word the course has meanwhile is refused (`duplicate_word`), and so
 * is an accept while someone else saved the unit (`unit_changed`: decide again).
 */
export function decideSuggestion(
  deps: WordSuggestionDeps,
  actor: ContentActor,
  id: string,
  decision: Decision
): Promise<DecisionResult> {
  return deps.suggestions.decide(id, actor, async (suggestion) => {
    if (decision.decision === 'rejected') return { ok: true, status: 'rejected' };

    const unit = await deps.content.get(suggestion.unitId);
    if (!unit) return { ok: false, reason: 'not_found' };
    const fields = SuggestedWordSchema.safeParse({
      ar: suggestion.ar,
      tr: suggestion.tr,
      de: suggestion.de,
      wurzel: suggestion.wurzel,
      plural: suggestion.plural,
      ...decision.word,
    });
    if (!fields.success) {
      return {
        ok: false,
        reason: 'invalid_word',
        issues: fields.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      };
    }
    const plain = plainArabic(fields.data.ar);
    // Accepted before, but the decision was not stored (the two are saved one after the
    // other): the word is in the unit already, so only the decision is recorded now.
    const there = unit.draft.vokabeln.find(
      (word) =>
        plainArabic(word.ar) === plain &&
        word.de === fields.data.de &&
        word.tr === fields.data.tr
    );
    if (there) return { ok: true, status: 'accepted', word: there };
    if ((await courseWords(deps.content, unit.course)).has(plain)) {
      return { ok: false, reason: 'duplicate_word' };
    }

    // An id another unit once had stays theirs: try the next one.
    const taken = new Set(unit.draft.vokabeln.map((word) => word.id));
    for (let attempt = 0; attempt < 5; attempt++) {
      const word: Vocab = {
        id: wordIdFor(fields.data.tr, taken),
        ...fields.data,
        einheit: unit.unit,
      };
      const next = validateUnitContent(unit.unit, {
        ...unit.draft,
        vokabeln: [...unit.draft.vokabeln, word],
      });
      if (!next.ok) return { ok: false, reason: 'invalid_word', issues: next.issues };
      const saved = await deps.content.saveDraft(
        unit.id,
        actor,
        unit.revision,
        next.content
      );
      if (saved.ok) return { ok: true, status: 'accepted', word };
      if (saved.reason === 'id_taken') {
        taken.add(word.id);
        continue;
      }
      if (saved.reason === 'not_found') return { ok: false, reason: 'not_found' };
      return { ok: false, reason: 'unit_changed' };
    }
    return { ok: false, reason: 'unit_changed' };
  });
}

const systemPrompt = `You help the editors of an Arabic course (Modern Standard Arabic, textbook "al-ʿArabiyya bayna yadayk") whose learners are Muslims living in Europe and speak German.
You get one unit: its title and the words it teaches, and the words of the whole course. Suggest up to ${WORDS_PER_RUN} further words for this unit:
- words these learners meet in their own life: the mosque and prayer, Ramadan and the feasts, family and community, food, school and work in Europe.
- they must fit the topic of this unit and the level of its words. No rare or literary words.
- no word the course already has, in any unit, and no two forms of the same word.
For each word give:
- "ar": the Arabic, fully vocalised, in the form the unit lists words in (nouns in the singular, verbs in the past tense, 3rd person masculine singular).
- "tr": its transliteration in the style of the unit's words (ā ī ū, ḥ ṣ ḍ ṭ ẓ, ʿ ʾ, sh, kh, gh, th, dh).
- "de": a short German gloss like a dictionary entry; for words of worship the term German-speaking Muslims use themselves.
- "wurzel": the root, letters separated by hyphens (ك-ت-ب), or "" for particles and loanwords.
- "plural": the vocalised plural of a noun, or null.
- "reason": one short German sentence saying why the word belongs in this unit.
Answer only with JSON: {"words": [{"ar": "…", "tr": "…", "de": "…", "wurzel": "…", "plural": null, "reason": "…"}]}.`;

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ar: { type: 'string' },
          tr: { type: 'string' },
          de: { type: 'string' },
          wurzel: { type: 'string' },
          plural: { type: ['string', 'null'] },
          reason: { type: 'string' },
        },
        required: ['ar', 'tr', 'de', 'wurzel', 'plural', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['words'],
  additionalProperties: false,
} as const;

const Answer = z.object({
  words: z
    .array(
      z.object({
        ar: z.string().max(1000),
        tr: z.string().max(1000),
        de: z.string().max(1000),
        wurzel: z.string().max(1000),
        plural: z.string().max(1000).nullable(),
        reason: z.string().max(2000),
      })
    )
    .max(WORDS_PER_RUN * 3),
});

const ARABIC = /\p{Script=Arabic}/u;

export type SuggestWordsResult =
  | { ok: true; suggested: number; model: string }
  | {
      ok: false;
      reason: 'not_found' | 'nothing_new' | 'ai_unavailable' | 'ai_quota' | 'ai_failed';
    };

/** Has the LLM suggest words for the unit and stores the usable ones for review. */
export async function suggestWords(
  deps: WordSuggestionDeps & { gateway: Pick<AiGateway, 'complete'> },
  actor: ContentActor,
  unitId: string
): Promise<SuggestWordsResult> {
  const unit = await deps.content.get(unitId);
  if (!unit) return { ok: false, reason: 'not_found' };
  const known = await courseWords(deps.content, unit.course);
  const before = await deps.suggestions.list(unitId);
  for (const suggestion of before) known.add(plainArabic(suggestion.ar));

  let answer: z.infer<typeof Answer>;
  let model: string;
  try {
    const result = await deps.gateway.complete(
      { id: actor.id, role: 'admin' },
      SUGGEST_TASK,
      {
        system: [{ text: systemPrompt, cache: true }],
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              unit: unit.unit,
              title: unit.draft.titel,
              words: unit.draft.vokabeln.map((w) => ({ ar: w.ar, tr: w.tr, de: w.de })),
              // Also what was suggested before, accepted or not: not again.
              courseWords: [...known],
            }),
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

  // Only words that have the shape of a word of the unit, are Arabic, and are new.
  const usable: NewSuggestion[] = [];
  for (const raw of answer.words) {
    const word = SuggestedWordSchema.safeParse({
      ar: raw.ar,
      tr: raw.tr,
      de: raw.de,
      wurzel: raw.wurzel,
      plural: raw.plural?.trim() ? raw.plural : null,
    });
    if (!word.success || !ARABIC.test(word.data.ar)) continue;
    const plain = plainArabic(word.data.ar);
    if (!plain || known.has(plain)) continue;
    known.add(plain);
    const reason = raw.reason.trim().slice(0, 500) || null;
    usable.push({ ...word.data, reason });
    if (usable.length === WORDS_PER_RUN) break;
  }
  if (usable.length === 0) {
    return { ok: false, reason: answer.words.length > 0 ? 'nothing_new' : 'ai_failed' };
  }
  const suggested = await deps.suggestions.save(unitId, usable, model, actor);
  return { ok: true, suggested, model };
}
