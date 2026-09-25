/** Client for the teacher's review of AI grades (story 11.2). */
import { apiRequest, type Fetch } from '@/services/api/request';
import type { Grade } from './tutorApi';

export interface ReviewItem extends Grade {
  learner: string;
}

export type Verdict =
  | { decision: 'confirm' }
  | { decision: 'override'; score: number; comment: string; corrected: string | null };

export class ReviewApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  queue(classId: string, status: 'open' | 'reviewed') {
    return apiRequest<{ grades: ReviewItem[] }>(
      this.fetchImpl,
      `/api/v1/classes/${encodeURIComponent(classId)}/grades?status=${status}`
    );
  }

  review(classId: string, gradeId: string, verdict: Verdict) {
    return apiRequest<void>(
      this.fetchImpl,
      `/api/v1/classes/${encodeURIComponent(classId)}/grades/${encodeURIComponent(gradeId)}`,
      { method: 'PUT', body: JSON.stringify(verdict) }
    );
  }

  /** The reviewed grades as eval cases (JSON), for the grading evals (story 11.3). */
  exportCases(classId: string) {
    return apiRequest<{ cases: unknown[] }>(
      this.fetchImpl,
      `/api/v1/classes/${encodeURIComponent(classId)}/grades/export`
    );
  }
}
