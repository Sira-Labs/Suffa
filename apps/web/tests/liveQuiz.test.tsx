import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { LiveQuiz } from '@/modules/classes/LiveQuiz';
import type { QuizView } from '@/services/classes/quizApi';
import { useSrsStore, useSyncStore } from '@/state';

const CLASS_ID = '11111111-1111-4111-8111-111111111111';

const base: QuizView = {
  id: 'q1',
  status: 'lobby',
  questionCount: 2,
  current: -1,
  questionSeconds: 20,
  questionStartedAt: null,
  players: 3,
  answered: 0,
  question: null,
  you: { joined: false, points: 0, answer: null },
  leaderboard: [],
};
const question = {
  index: 0,
  wordId: 'w-kitab',
  prompt: 'كِتَابٌ',
  options: ['Tür', 'Buch', 'Haus', 'Stift'],
  correct: null,
  distribution: null,
};

/** A fake API: the event stream is pushed by the test. */
function server(role: 'teacher' | 'student') {
  const encoder = new TextEncoder();
  let push: (view: QuizView | null) => void = () => undefined;
  const requests: { method: string; path: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const method = init?.method ?? 'GET';
      requests.push({
        method,
        path,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (path === '/api/v1/classes') {
        return Response.json({
          classes: [
            {
              id: CLASS_ID,
              name: 'Arabisch 1a',
              classRole: role,
              status: 'active',
              studentCount: 3,
              pendingCount: 0,
              createdAt: '2026-09-01T00:00:00.000Z',
            },
          ],
        });
      }
      if (path.endsWith('/quiz/events')) {
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            push = (quiz) =>
              controller.enqueue(
                encoder.encode(`event: state\ndata: ${JSON.stringify({ quiz })}\n\n`)
              );
            push(base);
          },
        });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      }
      if (path.endsWith('/quiz')) return Response.json({ quiz: base });
      return new Response(null, { status: 204 });
    })
  );
  return { push: (view: QuizView | null) => push(view), requests };
}

function renderQuiz() {
  const router = createMemoryRouter(
    [{ path: '/classes/:id/quiz', element: <LiveQuiz /> }],
    {
      initialEntries: [`/classes/${CLASS_ID}/quiz`],
    }
  );
  return render(<RouterProvider router={router} />);
}

describe('Live class quiz (story 14.4)', () => {
  const original = { sync: useSyncStore.getState(), srs: useSrsStore.getState() };
  const prioritise = vi.fn(async () => 1);

  beforeEach(() => {
    useSyncStore.setState({
      auth: { status: 'signed-in', user: { id: 'me', email: 'me@example.org' } },
    });
    useSrsStore.setState({ prioritise });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    prioritise.mockClear();
    useSyncStore.setState({ auth: original.sync.auth });
    useSrsStore.setState({ prioritise: original.srs.prioritise });
  });

  it('lets a learner join, answer, and turns a missed word into a due card', async () => {
    const api = server('student');
    renderQuiz();
    await userEvent.click(await screen.findByRole('button', { name: 'Mitmachen' }));
    expect(api.requests.some((r) => r.path.endsWith('/quiz/join'))).toBe(true);

    api.push({
      ...base,
      status: 'question',
      current: 0,
      questionStartedAt: new Date().toISOString(),
      question,
      you: { joined: true, points: 0, answer: null },
    });
    await userEvent.click(await screen.findByRole('button', { name: /Tür/ }));
    expect(api.requests.find((r) => r.path.endsWith('/quiz/answer'))?.body).toEqual({
      question: 0,
      choice: 0,
    });

    api.push({
      ...base,
      status: 'reveal',
      current: 0,
      question: { ...question, correct: 1, distribution: [1, 2, 0, 0] },
      you: { joined: true, points: 0, answer: { choice: 0, correct: false } },
      leaderboard: [{ name: 'Amina', points: 950, you: false }],
    });
    expect(await screen.findByText(/Leider falsch/)).toBeInTheDocument();
    expect(screen.getByText('Buch')).toBeInTheDocument();
    expect(screen.getByText(/1\. Amina/)).toBeInTheDocument();
    expect(prioritise).toHaveBeenCalledWith(['w-kitab']);
  });

  it('gives the teacher the projector controls', async () => {
    const api = server('teacher');
    renderQuiz();
    await userEvent.click(
      await screen.findByRole('button', { name: 'Erste Frage zeigen' })
    );
    expect(
      api.requests.some((r) => r.method === 'POST' && r.path.endsWith('/quiz/next'))
    ).toBe(true);
    api.push({
      ...base,
      status: 'question',
      current: 0,
      answered: 2,
      questionStartedAt: new Date().toISOString(),
      question: { ...question, correct: 1 },
      you: null,
    });
    expect(await screen.findByText(/2 von 3 geantwortet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Auflösen' }));
    expect(api.requests.some((r) => r.path.endsWith('/quiz/reveal'))).toBe(true);
  });
});
