/**
 * English drafts for a unit (story 16.4, ADR-0021): the LLM translates the German glosses that
 * have no English yet, with the Arabic beside them. The drafts land in the unit's draft only;
 * the publish step refuses new English until a teacher has checked that revision, so nothing
 * machine-translated reaches learners unreviewed. Existing English is never overwritten.
 */
import { LlmError, RouteUnavailableError } from '@suffa/llm';
import { z } from 'zod';
import { AiQuotaError, type AiGateway } from '../ai/gateway.js';
import type { ContentActor, ContentRepository, SaveResult } from './repository.js';
import { validateUnitContent, type UnitContent } from './schema.js';

export const TRANSLATE_TASK = 'content.translate';

/** One German text without English: where it is, the Arabic and the German. */
export interface MissingEnglish {
  place: string;
  kind: 'word' | 'line' | 'example';
  ar: string;
  de: string;
}

/** More than this per request is split by the admin running the draft again. */
export const MAX_ITEMS_PER_DRAFT = 250;

export function missingEnglish(content: UnitContent): MissingEnglish[] {
  const items: MissingEnglish[] = [];
  for (const v of content.vokabeln) {
    if (!v.en) items.push({ place: v.id, kind: 'word', ar: v.ar, de: v.de });
  }
  for (const d of content.dialoge) {
    d.zeilen.forEach((line, i) => {
      if (!line.en)
        items.push({ place: `${d.id}#${i}`, kind: 'line', ar: line.ar, de: line.de });
    });
  }
  for (const g of content.grammatik) {
    g.beispiele.forEach((ex, i) => {
      if (!ex.en)
        items.push({ place: `${g.id}#${i}`, kind: 'example', ar: ex.ar, de: ex.de });
    });
  }
  return items;
}

/** Fills English into the places the model translated; places that have English stay. */
export function applyEnglish(
  content: UnitContent,
  translations: ReadonlyMap<string, string>
): { content: UnitContent; filled: number } {
  let filled = 0;
  const take = (place: string, current: string | undefined): string | undefined => {
    if (current) return current;
    const text = translations.get(place)?.trim();
    if (!text) return undefined;
    filled++;
    return text;
  };
  const withEn = <T extends { en?: string }>(item: T, place: string): T => {
    const en = take(place, item.en);
    return en ? { ...item, en } : item;
  };
  const next: UnitContent = {
    ...content,
    vokabeln: content.vokabeln.map((v) => withEn(v, v.id)),
    dialoge: content.dialoge.map((d) => ({
      ...d,
      zeilen: d.zeilen.map((line, i) => withEn(line, `${d.id}#${i}`)),
    })),
    grammatik: content.grammatik.map((g) => ({
      ...g,
      beispiele: g.beispiele.map((ex, i) => withEn(ex, `${g.id}#${i}`)),
    })),
  };
  return { content: next, filled };
}

const SYSTEM_PROMPT = `You translate the German glosses of an Arabic course (Modern Standard Arabic) into English for English-speaking learners.
Each item has its Arabic and its German. Translate the meaning of the Arabic as the German gloss gives it:
- word: a short gloss like a dictionary entry. Keep alternatives separated by ", " or "; " as in the German, keep notes in parentheses, verbs as "to …".
- line, example: a natural English sentence with the same meaning and punctuation.
Do not add explanations. Keep Arabic names in their usual English spelling.
Answer only with JSON: {"translations": [{"place": "<place>", "en": "<English>"}]}, one entry per item, places exactly as given.`;

const TRANSLATION_SCHEMA = {
  type: 'object',
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { place: { type: 'string' }, en: { type: 'string' } },
        required: ['place', 'en'],
        additionalProperties: false,
      },
    },
  },
  required: ['translations'],
  additionalProperties: false,
} as const;

const TranslationAnswer = z.object({
  translations: z
    .array(z.object({ place: z.string().max(200), en: z.string().max(4000) }))
    .max(MAX_ITEMS_PER_DRAFT * 2),
});

export type DraftResult =
  | { ok: true; revision: number; filled: number; remaining: number; model: string }
  | {
      ok: false;
      reason: 'nothing_to_translate' | 'ai_unavailable' | 'ai_quota' | 'ai_failed';
    }
  | Exclude<SaveResult, { ok: true }>
  | { ok: false; reason: 'invalid_content'; issues: string[] };

export interface TranslateDeps {
  repo: Pick<ContentRepository, 'get' | 'saveDraft'>;
  gateway: Pick<AiGateway, 'complete'>;
}

/** Drafts English for what the unit's draft lacks and saves it as the next draft revision. */
export async function draftEnglish(
  deps: TranslateDeps,
  actor: ContentActor,
  id: string,
  revision: number
): Promise<DraftResult> {
  const unit = await deps.repo.get(id);
  if (!unit) return { ok: false, reason: 'not_found' };
  if (unit.revision !== revision) return { ok: false, reason: 'stale_revision' };
  const missing = missingEnglish(unit.draft);
  if (missing.length === 0) return { ok: false, reason: 'nothing_to_translate' };
  const batch = missing.slice(0, MAX_ITEMS_PER_DRAFT);

  let answer: z.infer<typeof TranslationAnswer>;
  let model: string;
  try {
    const result = await deps.gateway.complete(
      { id: actor.id, role: 'admin' },
      TRANSLATE_TASK,
      {
        system: [{ text: SYSTEM_PROMPT, cache: true }],
        messages: [
          {
            role: 'user',
            content: JSON.stringify({
              unit: unit.unit,
              title: unit.draft.titel,
              items: batch,
            }),
          },
        ],
        jsonSchema: TRANSLATION_SCHEMA as unknown as Record<string, unknown>,
      }
    );
    answer = TranslationAnswer.parse(JSON.parse(result.text));
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

  // Only places that were asked for: the model cannot touch anything else.
  const asked = new Set(batch.map((item) => item.place));
  const translations = new Map(
    answer.translations.filter((t) => asked.has(t.place)).map((t) => [t.place, t.en])
  );
  const { content, filled } = applyEnglish(unit.draft, translations);
  if (filled === 0) return { ok: false, reason: 'ai_failed' };
  const checked = validateUnitContent(unit.unit, content);
  if (!checked.ok)
    return { ok: false, reason: 'invalid_content', issues: checked.issues };
  const saved = await deps.repo.saveDraft(id, actor, revision, checked.content);
  if (!saved.ok) return saved;
  return {
    ok: true,
    revision: saved.revision,
    filled,
    remaining: missing.length - filled,
    model,
  };
}
