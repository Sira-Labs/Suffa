/**
 * Testers' feedback: sending from any page, and the admins' inbox. Same origin; a signed-in
 * sender's session cookie goes along, so the team can ask back.
 */
import i18n from '@/i18n';
import { apiRequest, type Fetch } from '@/services/api/request';

export const FEEDBACK_KINDS = ['bug', 'idea', 'confusing', 'praise'] as const;
export type FeedbackKind = (typeof FEEDBACK_KINDS)[number];

/** A kind of feedback in words, in the interface language. */
export function feedbackKindLabel(kind: FeedbackKind): string {
  return i18n.t(`admin:feedback.kinds.${kind}`);
}

/** The kinds in words; each read gives the label in the current interface language. */
export const FEEDBACK_KIND_LABEL: Readonly<Record<FeedbackKind, string>> = {
  get bug() {
    return feedbackKindLabel('bug');
  },
  get idea() {
    return feedbackKindLabel('idea');
  },
  get confusing() {
    return feedbackKindLabel('confusing');
  },
  get praise() {
    return feedbackKindLabel('praise');
  },
};

export interface FeedbackItem {
  id: string;
  kind: FeedbackKind;
  message: string;
  page: string;
  appVersion: string;
  userAgent: string;
  status: 'new' | 'done';
  createdAt: string;
  sender: { id: string; name: string | null; email: string | null; role: string } | null;
}

export class FeedbackApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  send(feedback: { kind: FeedbackKind; message: string; page: string }) {
    return this.call<{ id: string }>('/api/v1/feedback', {
      method: 'POST',
      body: JSON.stringify({
        ...feedback,
        appVersion: import.meta.env.VITE_SUFFA_VERSION || 'dev',
      }),
    });
  }

  list(before?: string | null) {
    return this.call<{ items: FeedbackItem[]; next: string | null; open: number }>(
      `/api/v1/admin/feedback${before ? `?before=${encodeURIComponent(before)}` : ''}`
    );
  }

  setStatus(id: string, status: 'new' | 'done') {
    return this.call<void>(`/api/v1/admin/feedback/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  private call<T>(path: string, init: RequestInit = {}) {
    return apiRequest<T>(this.fetchImpl, path, init, 'feedback');
  }
}
