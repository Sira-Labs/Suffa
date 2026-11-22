/**
 * Meanings in further languages (story 18.4, ADR-0031): an admin has the LLM draft the
 * meanings of a unit's words in Turkish, Italian, Bosnian or Albanian; a teacher approves,
 * corrects or rejects each one. Nothing of it is part of what learners get.
 */
import { apiRequest, type ApiResult, type Fetch } from '@/services/api/request';

/** The languages meanings are drafted in, in the order they are offered. */
export const MEANING_DRAFT_LANGUAGES = ['tr', 'it', 'bs', 'sq'] as const;
export type MeaningDraftLanguage = (typeof MEANING_DRAFT_LANGUAGES)[number];
export type MeaningDraftStatus = 'draft' | 'approved' | 'rejected';

/** The server takes no longer text for a meaning. */
export const MAX_MEANING_LENGTH = 500;

export interface WordDraft {
  id: string;
  text: string;
  status: MeaningDraftStatus;
  model: string;
  reviewedAt: string | null;
  /** The word's German changed since the draft: it must be drafted again. */
  stale: boolean;
  /** The reader ordered this draft themselves: someone else decides on it. */
  own: boolean;
}

/** A word of the unit with its draft in the language, if there is one. */
export interface WordWithDraft {
  wordId: string;
  ar: string;
  de: string;
  draft: WordDraft | null;
}

/** What a reviewer decides, always about the text they had before them (`seen`). */
export type MeaningDecision =
  | { decision: 'approved'; seen: string; text?: string }
  | { decision: 'rejected'; seen: string };

export class MeaningsApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  list(
    unitId: string,
    language: MeaningDraftLanguage
  ): Promise<ApiResult<{ words: WordWithDraft[] }>> {
    return apiRequest(this.fetchImpl, meaningsPath(unitId, language), {}, 'meanings');
  }

  /** Has the LLM draft what the unit's words lack in the language (admins). */
  draft(
    unitId: string,
    language: MeaningDraftLanguage
  ): Promise<ApiResult<{ drafted: number; remaining: number }>> {
    return apiRequest(
      this.fetchImpl,
      `${meaningsPath(unitId, language)}/draft`,
      { method: 'POST' },
      'meanings'
    );
  }

  review(
    draftId: string,
    decision: MeaningDecision
  ): Promise<ApiResult<{ draft: Pick<WordDraft, 'id' | 'text' | 'status'> }>> {
    return apiRequest(
      this.fetchImpl,
      `/api/v1/content/meaning-drafts/${encodeURIComponent(draftId)}/review`,
      { method: 'POST', body: JSON.stringify(decision) },
      'meanings'
    );
  }
}

/** "bayna-yadayk/3", "tr" → /api/v1/content/units/bayna-yadayk/3/meanings/tr */
function meaningsPath(unitId: string, language: MeaningDraftLanguage): string {
  const [course = '', unit = ''] = unitId.split('/');
  return `/api/v1/content/units/${encodeURIComponent(course)}/${encodeURIComponent(unit)}/meanings/${language}`;
}

/** How many words wait for a decision, are approved, rejected, or have no usable draft. */
export function countDrafts(words: readonly WordWithDraft[]) {
  const counts = { waiting: 0, approved: 0, rejected: 0, missing: 0 };
  for (const { draft } of words) {
    if (!draft || draft.stale) counts.missing += 1;
    else if (draft.status === 'draft') counts.waiting += 1;
    else counts[draft.status] += 1;
  }
  return counts;
}
