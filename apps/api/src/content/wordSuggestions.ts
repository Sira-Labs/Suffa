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
import type { ContentActor, ContentRepository, SaveResult } from './repository.js';
import {
  validateUnitContent,
  VocabSchema,
  type UnitContent,
  type Vocab,
} from './schema.js';

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
  /** The key of the Arabic as it was suggested; a correction does not change it. */
  arKey: string;
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
 * The key two spellings of one word share: without tatweel, sukun, case endings and the
 * article, a long vowel written with or without its short one, hamza on alif folded. Short
 * vowels inside the word and the shadda stay: رَجُل and رِجْل, دَرَسَ and دَرَّسَ are different words.
 * A word written without vowel signs gets another key than its vocalised spelling; that
 * duplicate is left to the reviewer rather than refusing a word that only looks alike.
 */
export function arabicKey(text: string): string {
  const key = text
    .normalize('NFC')
    .trim()
    .replace(/\u0640/g, '')
    // The article, written ال, ٱل or اَلْ, when a word of three letters or more follows
    // (not الله or الآن).
    .replace(/^(?:ا\u064E?|ٱ)ل\u0652?(?=(?:\p{L}\p{M}*){3,}$)/u, '')
    .replace(/[\u0652\u064B-\u064D]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    // A long vowel with or without the short vowel before it.
    .replace(/\u064E(?=[اى])/g, '')
    .replace(/\u0650(?=ي)/g, '')
    .replace(/\u064F(?=و)/g, '');
  // The ending of the last letter (كِتابُ, دَرَسَ, حَقُّ), not its shadda: in NFC the vowel
  // stands before the shadda.
  return key.replace(/[\u064E-\u0651]+$/u, (marks) =>
    marks.includes('\u0651') ? '\u0651' : ''
  );
}

const ARTICLE = /^(?:al|ath|adh|ash|at|ad|ar|az|as|an)-(?=[a-z0-9])/;

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
      .trim()
      // The article, also assimilated (as-, ar-, ash-): ids name the word itself.
      .replace(ARTICLE, '')
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 60)
      .replace(/^-+|-+$/g, '') || 'wort';
  for (let n = 1; ; n++) {
    const id = n === 1 ? `v-${slug}` : `v-${slug}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/** The ids `wordIdFor` could give a transliteration: `v-salam`, `v-salam-2`, … */
export const wordIdBase = (transliteration: string): string =>
  wordIdFor(transliteration, new Set());

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
  ar_key: string;
}

const COLUMNS = `id, unit_id, ar, tr, de, wurzel, plural, reason, model, status, suggested_by,
  decided_by, decided_at, word_id, ar_key`;

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
  arKey: row.ar_key,
});

/** A word to append to a unit, worked out from the draft at `revision`. */
export interface AcceptPlan {
  unitId: string;
  /** The unit's revision the plan was made for; another revision by now refuses it. */
  revision: number;
  /** The whole draft with the word in it, or null when the word is in the draft already. */
  content: UnitContent | null;
  word: Vocab;
}

/** Saves a unit's draft inside a transaction that is already open (PgContentRepository). */
export interface DraftSaver {
  saveDraftWith(
    client: pg.PoolClient,
    id: string,
    actor: ContentActor,
    revision: number,
    content: UnitContent
  ): Promise<SaveResult>;
}

export interface WordSuggestionRepository {
  list(unitId: string): Promise<WordSuggestion[]>;
  get(id: string): Promise<WordSuggestion | null>;
  /**
   * Stores suggestions the unit does not have yet (by key), no more than keep it at
   * `MAX_OPEN_SUGGESTIONS` undecided ones; returns how many were stored.
   */
  save(
    unitId: string,
    suggestions: NewSuggestion[],
    model: string,
    actor: ContentActor
  ): Promise<number>;
  /**
   * Accepts a suggestion: the unit's draft and the decision are saved in one transaction,
   * or neither. Nobody decides on a suggestion they ordered themselves (`own_suggestion`),
   * a decided one stays as it is (`already_decided`), and a unit that is no longer at the
   * plan's revision refuses it (`unit_changed`).
   */
  accept(id: string, actor: ContentActor, plan: AcceptPlan): Promise<DecisionResult>;
  reject(id: string, actor: ContentActor): Promise<DecisionResult>;
  /** Every content id that starts with `base`, in any unit, also ids no longer in use. */
  idsStartingWith(base: string): Promise<string[]>;
}

export class PgWordSuggestionRepository implements WordSuggestionRepository {
  constructor(
    private readonly pool: pg.Pool,
    private readonly drafts: DraftSaver
  ) {}

  async list(unitId: string): Promise<WordSuggestion[]> {
    const { rows } = await this.pool.query<Row>(
      `select ${COLUMNS} from content_word_suggestions
        where unit_id = $1 order by suggested_at, ar_key`,
      [unitId]
    );
    return rows.map(toSuggestion);
  }

  async get(id: string): Promise<WordSuggestion | null> {
    const { rows } = await this.pool.query<Row>(
      `select ${COLUMNS} from content_word_suggestions where id = $1`,
      [id]
    );
    return rows[0] ? toSuggestion(rows[0]) : null;
  }

  async save(
    unitId: string,
    suggestions: NewSuggestion[],
    model: string,
    actor: ContentActor
  ): Promise<number> {
    if (suggestions.length === 0) return 0;
    return inTransaction(this.pool, async (db) => {
      // One save per unit at a time, so that two runs that both started below the limit
      // cannot together go past it.
      await db.query(`select 1 from content_units where id = $1 for update`, [unitId]);
      const open = await db.query<{ n: number }>(
        `select count(*)::int as n from content_word_suggestions
          where unit_id = $1 and status = 'suggested'`,
        [unitId]
      );
      let room = MAX_OPEN_SUGGESTIONS - open.rows[0]!.n;
      let saved = 0;
      for (const s of suggestions) {
        if (room <= 0) break;
        const result = await db.query(
          `insert into content_word_suggestions
             (unit_id, ar, tr, de, wurzel, plural, reason, ar_key, model, suggested_by)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           on conflict (unit_id, ar_key) do nothing`,
          [
            unitId,
            s.ar,
            s.tr,
            s.de,
            s.wurzel,
            s.plural ?? null,
            s.reason,
            arabicKey(s.ar),
            model,
            actor.id,
          ]
        );
        saved += result.rowCount ?? 0;
        room -= result.rowCount ?? 0;
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

  accept(id: string, actor: ContentActor, plan: AcceptPlan): Promise<DecisionResult> {
    // One connection for all of it: the suggestion is locked first, then the unit.
    return inTransaction(this.pool, async (db) => {
      const open = await this.lockOpen(db, id, actor);
      if (!open.ok) return open;
      if (plan.content) {
        const saved = await this.drafts.saveDraftWith(
          db,
          plan.unitId,
          actor,
          plan.revision,
          plan.content
        );
        if (!saved.ok) {
          // Nothing was written: saved by someone else meanwhile, or the id was given away.
          return {
            ok: false,
            reason: saved.reason === 'not_found' ? 'not_found' : 'unit_changed',
          };
        }
      } else {
        // The word was found in the draft: only if that draft is still the one.
        const unit = await db.query<{ revision: number }>(
          `select revision from content_units where id = $1 for share`,
          [plan.unitId]
        );
        if (unit.rows[0]?.revision !== plan.revision) {
          return { ok: false, reason: 'unit_changed' };
        }
      }
      return this.store(db, open.row, actor, plan.word);
    });
  }

  reject(id: string, actor: ContentActor): Promise<DecisionResult> {
    return inTransaction(this.pool, async (db) => {
      const open = await this.lockOpen(db, id, actor);
      return open.ok ? this.store(db, open.row, actor, null) : open;
    });
  }

  /** Locks the suggestion and says whether this reviewer may still decide on it. */
  private async lockOpen(
    db: pg.PoolClient,
    id: string,
    actor: ContentActor
  ): Promise<{ ok: true; row: Row } | Extract<DecisionResult, { ok: false }>> {
    const found = await db.query<Row>(
      `select ${COLUMNS} from content_word_suggestions where id = $1 for update`,
      [id]
    );
    const row = found.rows[0];
    if (!row) return { ok: false, reason: 'not_found' };
    if (row.suggested_by === actor.id) return { ok: false, reason: 'own_suggestion' };
    if (row.status !== 'suggested') return { ok: false, reason: 'already_decided' };
    return { ok: true, row };
  }

  /** Stores the decision: accepted with `word` as it is in the unit, or rejected. */
  private async store(
    db: pg.PoolClient,
    row: Row,
    actor: ContentActor,
    word: Vocab | null
  ): Promise<DecisionResult> {
    const status: SuggestionStatus = word ? 'accepted' : 'rejected';
    const updated = await db.query<Row>(
      `update content_word_suggestions
          set status = $2, decided_by = $3, decided_at = now(), word_id = $4,
              ar = coalesce($5, ar), tr = coalesce($6, tr), de = coalesce($7, de),
              wurzel = coalesce($8, wurzel), plural = $9
        where id = $1 returning ${COLUMNS}`,
      [
        row.id,
        status,
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
      targetId: row.id,
      details: {
        unitId: row.unit_id,
        decision: status,
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
  }

  async idsStartingWith(base: string): Promise<string[]> {
    const { rows } = await this.pool.query<{ id: string }>(
      `select id from content_ids where left(id, length($1)) = $1`,
      [base]
    );
    return rows.map((row) => row.id);
  }
}

export interface WordSuggestionDeps {
  content: Pick<ContentRepository, 'get' | 'list'>;
  suggestions: WordSuggestionRepository;
}

/** Every word of the course by its key, from the drafts (what editors work on). */
async function courseWords(
  content: Pick<ContentRepository, 'get' | 'list'>,
  course: string
): Promise<Set<string>> {
  const words = new Set<string>();
  for (const summary of await content.list()) {
    if (summary.course !== course) continue;
    const unit = await content.get(summary.id);
    for (const word of unit?.draft.vokabeln ?? []) words.add(arabicKey(word.ar));
  }
  return words;
}

const ARABIC_LETTER = /\p{Script=Arabic}/u;
const LETTER = /\p{L}/u;

/** Arabic, and nothing written in another script: no "sahurس" from a model or a slip. */
export function isArabicWord(text: string): boolean {
  let arabic = 0;
  for (const char of text) {
    if (!LETTER.test(char)) continue;
    if (!ARABIC_LETTER.test(char)) return false;
    arabic += 1;
  }
  return arabic > 0;
}

/**
 * A reviewer's decision. Accepting writes the word (as suggested, or with the reviewer's
 * corrections) into the unit's draft as its next revision: the unit is a draft again, a
 * check of the revision before no longer counts, and it reaches learners when it is
 * published. A word another unit has meanwhile is refused (`duplicate_word`), and so is an
 * accept while someone else saved the unit (`unit_changed`: decide again).
 *
 * What to write is worked out first, from plain reads; the unit and the decision are then
 * saved in one transaction (`accept`), which refuses the plan if the unit moved on or the
 * suggestion was decided meanwhile. No connection is held while another is asked for.
 */
export async function decideSuggestion(
  deps: WordSuggestionDeps,
  actor: ContentActor,
  id: string,
  decision: Decision
): Promise<DecisionResult> {
  if (decision.decision === 'rejected') return deps.suggestions.reject(id, actor);

  const suggestion = await deps.suggestions.get(id);
  if (!suggestion) return { ok: false, reason: 'not_found' };
  // Checked again under lock when the decision is stored; here to answer without work.
  if (suggestion.suggestedBy === actor.id) return { ok: false, reason: 'own_suggestion' };
  if (suggestion.status !== 'suggested') return { ok: false, reason: 'already_decided' };

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
  const key = arabicKey(fields.data.ar);
  if (!isArabicWord(fields.data.ar) || !key) {
    return { ok: false, reason: 'invalid_word', issues: ['ar: must be an Arabic word'] };
  }
  const plan = { unitId: unit.id, revision: unit.revision };

  // In this unit already, as corrected now or as first suggested (an editor was faster):
  // the suggestion is settled by that word, and the unit is not written.
  const there = unit.draft.vokabeln.find((word) => {
    const k = arabicKey(word.ar);
    return k === key || k === suggestion.arKey;
  });
  if (there) {
    return deps.suggestions.accept(id, actor, { ...plan, content: null, word: there });
  }
  if ((await courseWords(deps.content, unit.course)).has(key)) {
    return { ok: false, reason: 'duplicate_word' };
  }

  // Ids are never used twice, also not one this unit had and dropped: review cards and
  // meanings in further languages point at them.
  const taken = new Set([
    ...unit.draft.vokabeln.map((word) => word.id),
    ...(await deps.suggestions.idsStartingWith(wordIdBase(fields.data.tr))),
  ]);
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
  return deps.suggestions.accept(id, actor, { ...plan, content: next.content, word });
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

/** A unit with this many undecided suggestions gets no more: decide on those first. */
export const MAX_OPEN_SUGGESTIONS = WORDS_PER_RUN;

export type SuggestWordsResult =
  | { ok: true; suggested: number; model: string }
  | {
      ok: false;
      reason:
        | 'not_found'
        | 'decide_first'
        | 'nothing_new'
        | 'ai_unavailable'
        | 'ai_quota'
        | 'ai_failed';
    };

/** Has the LLM suggest words for the unit and stores the usable ones for review. */
export async function suggestWords(
  deps: WordSuggestionDeps & { gateway: Pick<AiGateway, 'complete'> },
  actor: ContentActor,
  unitId: string
): Promise<SuggestWordsResult> {
  const unit = await deps.content.get(unitId);
  if (!unit) return { ok: false, reason: 'not_found' };
  const before = await deps.suggestions.list(unitId);
  // Before the model is paid: a pile nobody decided on does not grow.
  if (before.filter((s) => s.status === 'suggested').length >= MAX_OPEN_SUGGESTIONS) {
    return { ok: false, reason: 'decide_first' };
  }
  const known = await courseWords(deps.content, unit.course);
  for (const suggestion of before) {
    known.add(suggestion.arKey);
    known.add(arabicKey(suggestion.ar));
  }

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
  let knownAlready = 0;
  for (const raw of answer.words) {
    // A NUL from the model would make the database refuse the whole batch.
    const text = (value: string) => value.replaceAll('\u0000', '');
    const word = SuggestedWordSchema.safeParse({
      ar: text(raw.ar),
      tr: text(raw.tr),
      de: text(raw.de),
      wurzel: text(raw.wurzel),
      plural: raw.plural && text(raw.plural).trim() ? text(raw.plural) : null,
    });
    if (!word.success || !isArabicWord(word.data.ar)) continue;
    const key = arabicKey(word.data.ar);
    if (!key) continue;
    if (known.has(key)) {
      knownAlready += 1;
      continue;
    }
    known.add(key);
    const reason = text(raw.reason).trim().slice(0, 500) || null;
    usable.push({ ...word.data, reason });
    if (usable.length === WORDS_PER_RUN) break;
  }
  if (usable.length === 0) {
    // Words, but none new: said as such. Nothing that is a word at all: the run failed.
    return { ok: false, reason: knownAlready > 0 ? 'nothing_new' : 'ai_failed' };
  }
  const suggested = await deps.suggestions.save(unitId, usable, model, actor);
  return { ok: true, suggested, model };
}
