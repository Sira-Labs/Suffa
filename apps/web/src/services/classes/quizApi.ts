/**
 * Live class quiz (story 14.4): the teacher's controls, the learner's answers and the event
 * stream that pushes every change to the projector and the phones.
 */
import { apiRequest, type Fetch } from '@/services/api/request';
import { readEvents } from '@/services/tutor/tutorApi';

export type QuizStatus = 'lobby' | 'question' | 'reveal' | 'finished';

export interface QuizView {
  id: string;
  status: QuizStatus;
  questionCount: number;
  current: number;
  questionSeconds: number;
  questionStartedAt: string | null;
  players: number;
  answered: number;
  question: {
    index: number;
    wordId: string;
    prompt: string;
    options: string[];
    correct: number | null;
    distribution: number[] | null;
  } | null;
  you: {
    joined: boolean;
    points: number;
    answer: { choice: number; correct: boolean | null } | null;
  } | null;
  leaderboard: { name: string; points: number; you: boolean }[];
}

const MESSAGES: Record<string, string> = {
  running: 'In dieser Klasse läuft schon ein Quiz.',
  no_words: 'Für ein Quiz fehlen noch Wörter.',
  no_quiz: 'Gerade läuft kein Quiz.',
  wrong_state: 'Diese Frage ist schon vorbei.',
  too_late: 'Die Zeit für diese Frage ist um.',
  not_joined: 'Tritt zuerst dem Quiz bei.',
  teacher: 'Als Lehrkraft steuerst du das Quiz.',
};

export class QuizApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  view(classId: string) {
    return this.call<{ quiz: QuizView | null }>(this.base(classId));
  }

  create(classId: string, count?: number) {
    return this.call<{ id: string }>(this.base(classId), {
      method: 'POST',
      body: JSON.stringify(count ? { count } : {}),
    });
  }

  next(classId: string) {
    return this.post(classId, 'next');
  }

  reveal(classId: string) {
    return this.post(classId, 'reveal');
  }

  finish(classId: string) {
    return this.post(classId, 'finish');
  }

  join(classId: string) {
    return this.post(classId, 'join');
  }

  answer(classId: string, question: number, choice: number) {
    return this.call<void>(`${this.base(classId)}/answer`, {
      method: 'POST',
      body: JSON.stringify({ question, choice }),
    });
  }

  /**
   * Every state change until `signal` aborts; reconnects after a dropped connection (the
   * first event after a reconnect is the current state, so nothing is missed).
   */
  async *events(classId: string, signal: AbortSignal): AsyncIterable<QuizView | null> {
    while (!signal.aborted) {
      try {
        const response = await this.fetchImpl(`${this.base(classId)}/events`, {
          credentials: 'same-origin',
          headers: { accept: 'text/event-stream' },
          signal,
        });
        if (!response.ok || !response.body) throw new Error(`status ${response.status}`);
        for await (const event of readEvents<{ quiz: QuizView | null }>(response.body)) {
          yield event.quiz;
        }
      } catch (error) {
        if (signal.aborted) return;
        if (!(error instanceof Error)) throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  private post(classId: string, action: string) {
    return this.call<void>(`${this.base(classId)}/${action}`, { method: 'POST' });
  }

  private base(classId: string) {
    return `/api/v1/classes/${encodeURIComponent(classId)}/quiz`;
  }

  private call<T>(path: string, init: RequestInit = {}) {
    return apiRequest<T>(this.fetchImpl, path, init, MESSAGES);
  }
}
