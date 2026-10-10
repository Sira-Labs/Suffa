/**
 * The content CMS (story 16.1): course units with a draft, a review and a published state.
 * Teachers read units and check them; admins edit drafts, submit them and publish.
 */
import i18n from '@/i18n';
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

/** A unit's state in words, in the interface language. */
export function stateLabel(state: UnitState): string {
  return i18n.t(`content:state.${state}`);
}

export type UnitStep = 'submit' | 'check' | 'publish';

export class ContentApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  list(): Promise<ApiResult<{ units: UnitSummary[] }>> {
    return apiRequest(this.fetchImpl, '/api/v1/content/units', {}, 'content');
  }

  get(id: string): Promise<ApiResult<UnitDetail>> {
    return apiRequest(this.fetchImpl, unitPath(id), {}, 'content');
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
      'content'
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
      'content'
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
      'content'
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
