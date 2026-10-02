/**
 * Feedback while testing: the button appears only when the server turns it on, sends the
 * report with the page it was written on, and the admins' inbox lists and files reports.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FeedbackButton } from '@/modules/feedback/FeedbackButton';
import { FeedbackAdmin } from '@/modules/admin/FeedbackAdmin';
import { loadClientConfig, resetClientConfigForTests } from '@/services/clientConfig';
import { FeedbackApi, type FeedbackItem } from '@/services/feedback/feedbackApi';

interface Sent {
  method: string;
  path: string;
  body: unknown;
}

/** A fake API: records requests and answers like the server. */
function fakeApi(items: FeedbackItem[] = []) {
  const sent: Sent[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    sent.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : null });
    if (method === 'POST') return Response.json({ id: 'f1' }, { status: 201 });
    if (method === 'PATCH') return new Response(null, { status: 204 });
    return Response.json({
      items,
      next: null,
      open: items.filter((i) => i.status === 'new').length,
    });
  });
  return { api: new FeedbackApi(fetchImpl as typeof fetch), sent };
}

function stubClientConfig(feedback: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => Response.json({ errorDsn: null, feedback }))
  );
}

describe('Feedback while testing', () => {
  beforeEach(() => resetClientConfigForTests());
  afterEach(() => vi.unstubAllGlobals());

  it('stays hidden when the server has feedback off', async () => {
    stubClientConfig(false);
    const { api } = fakeApi();
    render(
      <MemoryRouter>
        <FeedbackButton api={api} />
      </MemoryRouter>
    );
    // Let the config promise settle.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByRole('button', { name: 'Feedback' })).toBeNull();
  });

  it('sends a report with the page it was written on', async () => {
    stubClientConfig(true);
    const { api, sent } = fakeApi();
    render(
      <MemoryRouter initialEntries={['/classes/k1?tab=recordings']}>
        <FeedbackButton api={api} />
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Feedback' }));
    const dialog = screen.getByRole('dialog', { name: 'Feedback zu dieser Seite' });
    const send = within(dialog).getByRole('button', { name: 'Senden' });
    expect(send).toBeDisabled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fehler' }));
    await userEvent.type(
      within(dialog).getByLabelText('Deine Rückmeldung'),
      'Ich sehe nicht, wer das Video geschaut hat.'
    );
    await userEvent.click(send);
    expect(await within(dialog).findByText(/Danke!/)).toBeTruthy();
    expect(sent).toEqual([
      {
        method: 'POST',
        path: '/api/v1/feedback',
        body: {
          kind: 'bug',
          message: 'Ich sehe nicht, wer das Video geschaut hat.',
          page: '/classes/k1?tab=recordings',
          appVersion: expect.any(String),
        },
      },
    ]);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Fertig' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Feedback' })).toBeTruthy();
  });

  it('lists reports for the admins and files them away', async () => {
    const { api, sent } = fakeApi([
      {
        id: 'f2',
        kind: 'confusing',
        message: 'Wo ist meine Klasse?',
        page: '/',
        appVersion: 'sha-abc1234',
        userAgent: 'Test',
        status: 'new',
        createdAt: '2026-10-02T08:00:00.000Z',
        sender: { id: 'u1', name: 'Amina', email: 'amina@example.org', role: 'student' },
      },
      {
        id: 'f1',
        kind: 'praise',
        message: 'Schöne Lektion!',
        page: '/units/madinah/3',
        appVersion: '',
        userAgent: 'Test',
        status: 'done',
        createdAt: '2026-10-01T08:00:00.000Z',
        sender: null,
      },
    ]);
    render(
      <MemoryRouter>
        <FeedbackAdmin api={api} />
      </MemoryRouter>
    );
    expect(await screen.findByText('1 offene Rückmeldung')).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Rückmeldungen' });
    const [first, second] = within(list).getAllByRole('listitem');
    expect(within(first!).getByText('Unklar')).toBeTruthy();
    expect(within(first!).getByText(/Amina \(student\)/)).toBeTruthy();
    expect(within(second!).getByText(/ohne Konto/)).toBeTruthy();
    expect(
      within(second!).getByRole('link', { name: '/units/madinah/3' })
    ).toHaveAttribute('href', '/units/madinah/3');
    await userEvent.click(within(first!).getByRole('button', { name: 'Erledigt' }));
    expect(await screen.findByText('0 offene Rückmeldungen')).toBeTruthy();
    expect(sent.at(-1)).toEqual({
      method: 'PATCH',
      path: '/api/v1/admin/feedback/f2',
      body: { status: 'done' },
    });
  });

  it('moves focus into the form, and back to the button on Escape', async () => {
    stubClientConfig(true);
    const { api } = fakeApi();
    render(
      <MemoryRouter>
        <FeedbackButton api={api} />
      </MemoryRouter>
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Feedback' }));
    expect(screen.getByLabelText('Deine Rückmeldung')).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Feedback' })).toHaveFocus();
  });

  it('files a report once, however fast it is clicked', async () => {
    const patches: string[] = [];
    let answer: (r: Response) => void = () => {};
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patches.push(String(input));
        return new Promise<Response>((resolve) => (answer = resolve));
      }
      return Response.json({
        items: [
          {
            id: 'f3',
            kind: 'bug',
            message: 'x',
            page: '/',
            appVersion: '',
            userAgent: '',
            status: 'new',
            createdAt: '2026-10-02T08:00:00.000Z',
            sender: null,
          },
        ],
        next: null,
        open: 1,
      });
    });
    render(
      <MemoryRouter>
        <FeedbackAdmin api={new FeedbackApi(fetchImpl as typeof fetch)} />
      </MemoryRouter>
    );
    const done = await screen.findByRole('button', { name: 'Erledigt' });
    await userEvent.click(done);
    // While the first request runs, the button is off and a second click does nothing.
    expect(done).toBeDisabled();
    await userEvent.click(done);
    expect(patches).toHaveLength(1);
    answer(new Response(null, { status: 204 }));
    expect(await screen.findByText('0 offene Rückmeldungen')).toBeTruthy();
  });

  it('shows the button once the server answers after a failed start', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 503 }))
        .mockResolvedValue(Response.json({ errorDsn: null, feedback: true }));
      vi.stubGlobal('fetch', fetchMock);
      const { api } = fakeApi();
      render(
        <MemoryRouter>
          <FeedbackButton api={api} />
        </MemoryRouter>
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(screen.queryByRole('button', { name: 'Feedback' })).toBeNull();
      await vi.advanceTimersByTimeAsync(2000);
      expect(await screen.findByRole('button', { name: 'Feedback' })).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('asks for the configuration again after a server error', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ errorDsn: null, feedback: true }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadClientConfig()).rejects.toThrow();
    expect(await loadClientConfig()).toEqual({ errorDsn: null, feedback: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
