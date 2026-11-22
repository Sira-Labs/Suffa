/**
 * Meanings in further languages (story 18.4, ADR-0031) in "Inhalte prüfen": a teacher approves,
 * corrects or rejects each LLM draft; an admin orders the drafts.
 */
import { describe, expect, it } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeaningReview } from '@/modules/content/MeaningReview';
import {
  countDrafts,
  MeaningsApi,
  type WordWithDraft,
} from '@/services/content/meaningsApi';

const UNIT = 'bayna-yadayk/1';
const BASE = '/api/v1/content/units/bayna-yadayk/1/meanings';

const word = (
  wordId: string,
  de: string,
  draft: Partial<NonNullable<WordWithDraft['draft']>> | null
): WordWithDraft => ({
  wordId,
  ar: 'اسْم',
  de,
  draft: draft && {
    id: `d-${wordId}`,
    text: `tr ${de}`,
    status: 'draft',
    model: 'fake-model',
    reviewedAt: null,
    stale: false,
    own: false,
    ...draft,
  },
});

interface Sent {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

/** A fake API: the words of one language in memory, every request recorded. */
function fakeApi(
  initial: WordWithDraft[],
  refuse: Record<string, { status: number; error: string }> = {}
) {
  const sent: Sent[] = [];
  let words = initial;
  const api = new MeaningsApi(async (input, init) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;
    sent.push({ method, path, body });
    const refusal = refuse[`${method} ${path}`];
    if (refusal) {
      return Response.json({ error: refusal.error }, { status: refusal.status });
    }
    if (method === 'GET') return Response.json({ words });
    if (path.endsWith('/draft')) {
      const missing = words.filter((w) => !w.draft || w.draft.status === 'rejected');
      words = words.map((w) =>
        missing.includes(w) ? word(w.wordId, w.de, { text: `neu ${w.de}` }) : w
      );
      return Response.json({ drafted: missing.length, remaining: 0 });
    }
    const id = path.split('/').at(-2);
    const decided = (current: NonNullable<WordWithDraft['draft']>) => ({
      ...current,
      status: body!.decision as 'approved' | 'rejected',
      text: (body!.text as string | undefined) ?? current.text,
    });
    words = words.map((w) =>
      w.draft && w.draft.id === id ? { ...w, draft: decided(w.draft) } : w
    );
    const draft = words.find((w) => w.draft?.id === id)!.draft!;
    return Response.json({
      draft: { id: draft.id, text: draft.text, status: draft.status },
    });
  });
  return { api, sent };
}

const open = async (api: MeaningsApi, canDraft = false, language = 'Türkisch') => {
  render(<MeaningReview unitId={UNIT} canDraft={canDraft} api={api} />);
  await userEvent.selectOptions(screen.getByLabelText('Sprache'), language);
};
const rowOf = async (german: string) =>
  (await screen.findByRole('rowheader', { name: german })).closest('tr')!;

describe('countDrafts', () => {
  it('counts a stale draft as missing, whatever its state', () => {
    expect(
      countDrafts([
        word('a', 'Name', {}),
        word('b', 'neu', { status: 'approved' }),
        word('c', 'Buch', { status: 'rejected' }),
        word('d', 'Haus', { status: 'approved', stale: true }),
        word('e', 'Tür', null),
      ])
    ).toEqual({ waiting: 1, approved: 1, rejected: 1, missing: 2 });
  });
});

describe('MeaningReview', () => {
  it('asks for nothing until a language is chosen, then shows the drafts side by side', async () => {
    const { api, sent } = fakeApi([
      word('v-ism', 'Name', {}),
      word('v-new', 'neu', { status: 'approved' }),
      word('v-bab', 'Tür', null),
    ]);
    render(<MeaningReview unitId={UNIT} canDraft={false} api={api} />);
    expect(screen.getByText(/Lernende sehen davon nichts/)).toBeTruthy();
    expect(sent).toEqual([]);

    await userEvent.selectOptions(screen.getByLabelText('Sprache'), 'Albanisch');
    const row = await rowOf('Name');
    expect(sent).toEqual([{ method: 'GET', path: `${BASE}/sq`, body: null }]);
    expect(within(row).getByLabelText('Bedeutung von „Name“')).toHaveValue('tr Name');
    expect(within(row).getByText('zu prüfen')).toBeTruthy();
    expect(
      screen.getByText('Zu prüfen: 1 · freigegeben: 1 · abgelehnt: 0 · ohne Entwurf: 1')
    ).toBeTruthy();
    // A word without a draft has no row, and a teacher cannot order drafts.
    expect(screen.queryByRole('rowheader', { name: 'Tür' })).toBeNull();
    expect(screen.queryByRole('button', { name: /erstellen \(KI\)/ })).toBeNull();
  });

  it('approves a draft as it is, with the text the teacher saw', async () => {
    const { api, sent } = fakeApi([word('v-ism', 'Name', {})]);
    await open(api);
    await rowOf('Name');
    await userEvent.click(screen.getByRole('button', { name: '„Name“ freigeben' }));
    expect(await screen.findByText('Freigegeben.')).toBeTruthy();
    expect(sent[1]).toEqual({
      method: 'POST',
      path: '/api/v1/content/meaning-drafts/d-v-ism/review',
      body: { decision: 'approved', seen: 'tr Name' },
    });
    expect(within(await rowOf('Name')).getByText('freigegeben')).toBeTruthy();
  });

  it('approves the teacher’s own wording, and rejects', async () => {
    const { api, sent } = fakeApi([word('v-ism', 'Name', {}), word('v-new', 'neu', {})]);
    await open(api);
    const field = within(await rowOf('Name')).getByLabelText('Bedeutung von „Name“');
    await userEvent.clear(field);
    // Nothing to approve while the field is empty.
    expect(screen.getByRole('button', { name: '„Name“ freigeben' })).toBeDisabled();
    await userEvent.type(field, '  isim ');
    await userEvent.click(screen.getByRole('button', { name: '„Name“ freigeben' }));
    await screen.findByText('Freigegeben.');
    expect(sent[1]!.body).toEqual({
      decision: 'approved',
      seen: 'tr Name',
      text: 'isim',
    });
    expect(
      within(await rowOf('Name')).getByLabelText('Bedeutung von „Name“')
    ).toHaveValue('isim');

    await userEvent.click(screen.getByRole('button', { name: '„neu“ ablehnen' }));
    expect(await screen.findByText('Abgelehnt.')).toBeTruthy();
    expect(sent.at(-2)!.body).toEqual({ decision: 'rejected', seen: 'tr neu' });
    expect(screen.getByRole('button', { name: '„neu“ ablehnen' })).toBeDisabled();
  });

  it('says why a decision was refused and shows the list as it is now', async () => {
    const { api, sent } = fakeApi([word('v-ism', 'Name', {})], {
      'POST /api/v1/content/meaning-drafts/d-v-ism/review': {
        status: 409,
        error: 'draft_changed',
      },
    });
    await open(api);
    await rowOf('Name');
    await userEvent.click(screen.getByRole('button', { name: '„Name“ freigeben' }));
    expect(await screen.findByText(/inzwischen neu erstellt/)).toBeTruthy();
    // The list was loaded again after the refusal.
    expect(sent.map((s) => s.method)).toEqual(['GET', 'POST', 'GET']);
  });

  it('does not let a meaning of other German be approved', async () => {
    const { api } = fakeApi([word('v-ism', 'Name', { stale: true, status: 'approved' })]);
    await open(api);
    const row = await rowOf('Name');
    expect(within(row).getByText('Deutsch geändert – neu entwerfen')).toBeTruthy();
    expect(screen.getByRole('button', { name: '„Name“ freigeben' })).toBeDisabled();
    expect(within(row).getByLabelText('Bedeutung von „Name“')).toBeDisabled();
    expect(screen.getByText(/ohne Entwurf: 1/)).toBeTruthy();
  });

  it('lets an admin order the drafts that are missing or were rejected', async () => {
    const { api, sent } = fakeApi([
      word('v-ism', 'Name', { status: 'rejected' }),
      word('v-new', 'neu', { status: 'approved' }),
      word('v-bab', 'Tür', null),
    ]);
    await open(api, true, 'Bosnisch');
    await rowOf('Name');
    await userEvent.click(
      screen.getByRole('button', { name: 'Entwürfe für 2 Wörter erstellen (KI)' })
    );
    expect(await screen.findByText('2 Entwürfe erstellt.')).toBeTruthy();
    expect(sent[1]).toEqual({ method: 'POST', path: `${BASE}/bs/draft`, body: null });
    expect(within(await rowOf('Tür')).getByLabelText('Bedeutung von „Tür“')).toHaveValue(
      'neu Tür'
    );
    // Nothing left to order.
    expect(screen.queryByRole('button', { name: /erstellen \(KI\)/ })).toBeNull();
  });

  it('shows the server’s reason when a draft run fails', async () => {
    const { api } = fakeApi([word('v-ism', 'Name', null)], {
      [`POST ${BASE}/tr/draft`]: { status: 429, error: 'ai_quota' },
    });
    await open(api, true);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Entwurf für 1 Wort erstellen (KI)' })
    );
    expect(await screen.findByText(/KI-Kontingent für heute/)).toBeTruthy();
  });

  it('asks an admin for the second factor in words, not as a server error', async () => {
    const { api } = fakeApi([word('v-ism', 'Name', null)], {
      [`POST ${BASE}/tr/draft`]: { status: 403, error: 'second_factor_required' },
    });
    await open(api, true);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Entwurf für 1 Wort erstellen (KI)' })
    );
    expect(await screen.findByText(/Code aus deiner Authenticator-App/)).toBeTruthy();
  });

  it('says so when the list cannot be loaded', async () => {
    const { api } = fakeApi([], {
      [`GET ${BASE}/tr`]: { status: 404, error: 'not_found' },
    });
    await open(api);
    expect((await screen.findByRole('status')).textContent).not.toBe('');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('offers no decision on a draft the reader ordered themselves', async () => {
    const { api, sent } = fakeApi([word('v-ism', 'Name', { own: true })]);
    await open(api, true);
    const row = await rowOf('Name');
    expect(within(row).getByText(/von dir bestellt/)).toBeTruthy();
    expect(screen.getByRole('button', { name: '„Name“ freigeben' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '„Name“ ablehnen' })).toBeDisabled();
    expect(sent).toHaveLength(1);
  });

  it('does not approve the same text twice, but a new wording of it', async () => {
    const { api } = fakeApi([word('v-ism', 'Name', { status: 'approved' })]);
    await open(api);
    const row = await rowOf('Name');
    const approve = screen.getByRole('button', { name: '„Name“ freigeben' });
    expect(approve).toBeDisabled();
    await userEvent.type(within(row).getByLabelText('Bedeutung von „Name“'), ' (ad)');
    expect(approve).toBeEnabled();
  });

  it('takes no new wording while a decision is on its way', async () => {
    let release: (() => void) | undefined;
    const words = [word('v-ism', 'Name', {})];
    const api = new MeaningsApi(async (_input, init) => {
      if (init?.method !== 'POST') return Response.json({ words });
      await new Promise<void>((resolve) => (release = resolve));
      return Response.json({
        draft: { id: 'd-v-ism', text: 'isim', status: 'approved' },
      });
    });
    await open(api);
    const field = within(await rowOf('Name')).getByLabelText('Bedeutung von „Name“');
    await userEvent.clear(field);
    await userEvent.type(field, 'isim');
    await userEvent.click(screen.getByRole('button', { name: '„Name“ freigeben' }));
    expect(field).toBeDisabled();
    await act(async () => release!());
    await screen.findByText('Freigegeben.');
    expect(screen.getByLabelText('Bedeutung von „Name“')).toBeEnabled();
  });

  it('never shows one language’s drafts under another, however the answers arrive', async () => {
    // Turkish answers late, after Italian was chosen and answered.
    let releaseTurkish: (() => void) | undefined;
    const api = new MeaningsApi(async (input) => {
      const path = String(input);
      if (path.endsWith('/tr')) {
        await new Promise<void>((resolve) => (releaseTurkish = resolve));
        return Response.json({ words: [word('v-ism', 'Name', { text: 'isim' })] });
      }
      return Response.json({ words: [word('v-ism', 'Name', { text: 'nome' })] });
    });
    render(<MeaningReview unitId={UNIT} canDraft={false} api={api} />);
    await userEvent.selectOptions(screen.getByLabelText('Sprache'), 'Türkisch');
    await userEvent.selectOptions(screen.getByLabelText('Sprache'), 'Italienisch');
    const field = within(await rowOf('Name')).getByLabelText('Bedeutung von „Name“');
    expect(field).toHaveValue('nome');
    await act(async () => releaseTurkish!());
    expect(screen.getByLabelText('Bedeutung von „Name“')).toHaveValue('nome');
    expect(screen.getByRole('columnheader', { name: 'Italienisch' })).toBeTruthy();
  });
});
