/**
 * The content CMS (story 16.1): course units with a draft, a review and a published state.
 * Teachers read units and check them; admins edit drafts, submit them and publish.
 */
import { apiRequest, type ApiResult, type Fetch } from '@/services/api/request';
import type { Dialog, GrammatikPunkt, Vokabel } from '@/types';

export type UnitState = 'draft' | 'review' | 'published';

/** A unit's editable content. */
export interface UnitContent {
  titel: string;
  kulturnotiz?: string;
  vokabeln: Vokabel[];
  dialoge: Dialog[];
  grammatik: GrammatikPunkt[];
}

export interface UnitSummary {
  id: string;
  course: string;
  unit: number;
  title: string;
  state: UnitState;
  revision: number;
  checked: boolean;
  checkedAt: string | null;
  checkedBy: string | null;
  reviewNote: string | null;
  publishedRevision: number | null;
  publishedAt: string | null;
  updatedAt: string;
  updatedBy: string | null;
  counts: { vokabeln: number; dialoge: number; grammatik: number };
}

export interface ItemChanges {
  added: string[];
  removed: string[];
  changed: string[];
  textChanged: boolean;
}

export interface UnitDetail extends UnitSummary {
  draft: UnitContent;
  published: (UnitContent & { einheit: number; status?: string }) | null;
  changes: ItemChanges;
}

export const STATE_LABEL: Record<UnitState, string> = {
  draft: 'Entwurf',
  review: 'In Prüfung',
  published: 'Veröffentlicht',
};

const MESSAGES: Record<string, string> = {
  stale_revision:
    'Die Einheit wurde inzwischen geändert. Lade sie neu und übernimm deine Änderung dann.',
  wrong_state: 'Dieser Schritt passt nicht zum Stand der Einheit. Lade sie neu.',
  invalid_content: 'Der Inhalt ist so nicht gültig:',
  id_taken: 'Eine Kennung gehört schon zu einer anderen Einheit:',
  payload_too_large: 'Die Einheit ist zu groß.',
};

export type UnitStep = 'submit' | 'check' | 'publish';

export class ContentApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  list(): Promise<ApiResult<{ units: UnitSummary[] }>> {
    return apiRequest(this.fetchImpl, '/api/v1/content/units', {}, MESSAGES);
  }

  get(id: string): Promise<ApiResult<UnitDetail>> {
    return apiRequest(this.fetchImpl, unitPath(id), {}, MESSAGES);
  }

  saveDraft(
    id: string,
    revision: number,
    content: UnitContent
  ): Promise<ApiResult<{ revision: number }>> {
    return apiRequest(
      this.fetchImpl,
      `${unitPath(id)}/draft`,
      { method: 'PUT', body: JSON.stringify({ revision, content }) },
      MESSAGES
    );
  }

  step(
    id: string,
    step: UnitStep,
    revision: number
  ): Promise<ApiResult<{ revision: number }>> {
    return apiRequest(
      this.fetchImpl,
      `${unitPath(id)}/${step}`,
      { method: 'POST', body: JSON.stringify({ revision }) },
      MESSAGES
    );
  }

  /** A teacher sends the unit back to the editors. */
  returnToDraft(
    id: string,
    revision: number,
    note: string
  ): Promise<ApiResult<{ revision: number }>> {
    return apiRequest(
      this.fetchImpl,
      `${unitPath(id)}/return`,
      { method: 'POST', body: JSON.stringify({ revision, note }) },
      MESSAGES
    );
  }
}

/** "bayna-yadayk/3" → /api/v1/content/units/bayna-yadayk/3 */
function unitPath(id: string): string {
  const [course = '', unit = ''] = id.split('/');
  return `/api/v1/content/units/${encodeURIComponent(course)}/${encodeURIComponent(unit)}`;
}

/** An error message with the validation details, if the API sent any. */
export function errorText(result: { message: string; issues?: string[] }): string {
  return result.issues?.length
    ? `${result.message} ${result.issues.join('; ')}`
    : result.message;
}
