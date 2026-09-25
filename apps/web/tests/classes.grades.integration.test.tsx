/** The teacher's review of AI grades (story 11.2): confirm, override, export. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ClassGrades } from '@/modules/classes/ClassGrades';
import { ReviewApi } from '@/services/tutor/reviewApi';

const CLASS = '11111111-1111-4111-8111-111111111111';
const item = (id: string, learner: string) => ({
  id,
  learner,
  kind: 'writing',
  task: 'Beschreibe deine Schule.',
  answer: 'هذا مدرسة كبيرة.',
  score: 72,
  rubric: { task: 3, grammar: 2, vocabulary: 3, spelling: 4 },
  summary: 'Gut!',
  corrected: 'هٰذِهِ مَدْرَسَةٌ كَبيرَةٌ.',
  mistakes: [
    {
      original: 'هذا مدرسة',
      correction: 'هٰذِهِ مَدْرَسَةٌ',
      category: 'grammar',
      explanation: 'feminin',
      wordId: null,
    },
  ],
  status: 'auto',
  override: null,
  createdAt: '2026-09-25T10:00:00.000Z',
});

function setup() {
  const requests: { method: string; path: string; body: unknown }[] = [];
  let open = [item('g1', 'Amina'), item('g2', 'Bilal')];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ method, path, body });
    if (method === 'PUT') {
      open = open.filter((g) => !path.endsWith(g.id));
      return new Response(null, { status: 204 });
    }
    if (path.endsWith('/export'))
      return Response.json({ cases: [{ expectedScore: 60 }] });
    if (path.endsWith('status=reviewed')) {
      return Response.json({
        grades: [
          {
            ...item('g0', 'Yusuf'),
            status: 'overridden',
            override: { score: 60, comment: 'streng', corrected: null },
          },
        ],
      });
    }
    return Response.json({ grades: open });
  });
  render(<ClassGrades classId={CLASS} api={new ReviewApi(fetchImpl as typeof fetch)} />);
  return requests;
}

describe('Class grades review', () => {
  it('confirms one grade and overrides another', async () => {
    const requests = setup();
    const amina = await screen.findByRole('article', { name: 'Bewertung von Amina' });
    expect(within(amina).getByText('هذا مدرسة كبيرة.')).toBeTruthy();
    await userEvent.click(within(amina).getByRole('button', { name: 'Passt' }));
    expect(requests.find((r) => r.method === 'PUT')).toEqual({
      method: 'PUT',
      path: `/api/v1/classes/${CLASS}/grades/g1`,
      body: { decision: 'confirm' },
    });
    const bilal = await screen.findByRole('article', { name: 'Bewertung von Bilal' });
    await userEvent.click(within(bilal).getByRole('button', { name: 'Anpassen' }));
    const points = within(bilal).getByLabelText('Deine Punkte (0–100)');
    await userEvent.clear(points);
    await userEvent.type(points, '150');
    await userEvent.type(within(bilal).getByLabelText('Dein Kommentar'), 'Zwei Fehler.');
    await userEvent.click(within(bilal).getByRole('button', { name: 'Speichern' }));
    expect(requests.filter((r) => r.method === 'PUT')[1]?.body).toEqual({
      decision: 'override',
      score: 100,
      comment: 'Zwei Fehler.',
      corrected: null,
    });
    expect(await screen.findByText('Nichts zu prüfen.')).toBeTruthy();
  });

  it('lists reviewed grades and exports them as eval cases', async () => {
    const requests = setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Geprüft' }));
    expect(await screen.findByText(/Deine Bewertung:/)).toBeTruthy();
    const createObjectURL = vi.fn(() => 'blob:x');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    // jsdom cannot follow a download link.
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});
    await userEvent.click(
      screen.getByRole('button', { name: 'Als Eval-Fälle exportieren' })
    );
    expect(requests.at(-1)?.path).toBe(`/api/v1/classes/${CLASS}/grades/export`);
    expect(createObjectURL).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
});
