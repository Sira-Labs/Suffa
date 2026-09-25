import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LeagueCard } from '@/modules/classes/LeagueCard';
import { ClassesApi, type LeagueView } from '@/services/classes/classesApi';

function fakeApi(view: LeagueView) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const api = new ClassesApi(async (input, init) => {
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      path: String(input),
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (method === 'GET') return Response.json(view);
    return new Response(null, { status: 204 });
  });
  return { api, calls };
}

const base: LeagueView = {
  enabled: true,
  minors: false,
  optedIn: true,
  participants: 4,
  podium: [
    { place: 1, title: 'Wochen-Stern', name: 'Amina', percent: 100, you: false },
    { place: 2, title: 'Wochen-Held', name: 'Bilal', percent: 80, you: true },
  ],
  you: { percent: 80, activeDays: 4, goal: 5, onPodium: true },
};

describe('Weekly league card (story 14.2)', () => {
  it('shows the podium with the learner as "Du" and lets them leave', async () => {
    const { api, calls } = fakeApi(base);
    render(<LeagueCard api={api} classId="c1" teacher={false} />);
    expect(await screen.findByText('Amina')).toBeInTheDocument();
    expect(screen.getByText('Du')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Ich mache mit'));
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
      path: '/api/v1/classes/c1/league/opt-in',
      body: { optIn: false },
    });
  });

  it('shows a learner off the podium only their own week', async () => {
    const { api } = fakeApi({
      ...base,
      podium: base.podium.slice(0, 1),
      you: { percent: 40, activeDays: 2, goal: 5, onPodium: false },
    });
    render(<LeagueCard api={api} classId="c1" teacher={false} />);
    expect(await screen.findByText(/Deine Woche: 2 von 5 Tagen/)).toBeInTheDocument();
    expect(screen.queryByText(/Platz/)).toBeNull();
  });

  it('is hidden for learners while off, and marking minors switches it off', async () => {
    const off = fakeApi({ ...base, enabled: false, podium: [], you: null });
    const { container } = render(
      <LeagueCard api={off.api} classId="c1" teacher={false} />
    );
    await vi.waitFor(() => expect(off.calls.length).toBe(1));
    expect(container).toBeEmptyDOMElement();

    const { api, calls } = fakeApi({ ...base, optedIn: null, you: null });
    render(<LeagueCard api={api} classId="c1" teacher />);
    await userEvent.click(await screen.findByLabelText(/Klasse mit Minderjährigen/));
    expect(calls.find((c) => c.method === 'PUT')).toMatchObject({
      path: '/api/v1/classes/c1/league/settings',
      body: { enabled: false, minors: true },
    });
  });
});
