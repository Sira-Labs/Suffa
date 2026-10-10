/**
 * The content CMS in the web app (story 16.1): teachers check units under review or send them
 * back with a note; admins edit a draft, save it against its revision, submit and publish.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ContentReview } from '@/modules/content/ContentReview';
import { ContentAdmin } from '@/modules/admin/ContentAdmin';
import { parseExample } from '@/modules/content/UnitEditor';
import { describeAudit, type AuditEntry } from '@/services/admin/adminApi';
import {
  ContentApi,
  type UnitContent,
  type UnitDetail,
  type UnitSummary,
} from '@/services/content/contentApi';

const role = vi.hoisted(() => ({ current: 'teacher' as string | null }));
vi.mock('@/modules/account/useRole', () => ({ useRole: () => role.current }));

const content = (): UnitContent => ({
  titel: 'Der neue Student',
  kulturnotiz: 'Man grüßt mit as-salāmu ʿalaikum.',
  vokabeln: [
    {
      id: 'v-ism',
      ar: 'اسْم',
      tr: 'ism',
      de: 'Name',
      wurzel: 'س-م-و',
      plural: 'أَسْماء',
      einheit: 1,
    },
    {
      id: 'v-new',
      ar: 'جَديد',
      tr: 'ǧadīd',
      de: 'neu',
      wurzel: 'ج-د-د',
      plural: null,
      einheit: 1,
    },
  ],
  dialoge: [
    {
      id: 'd-1-1',
      einheit: 1,
      dialog: 1,
      titel: 'طالِبٌ جَديدٌ',
      zeilen: [{ sp: 'يوسُف', ar: 'السَّلامُ عَلَيْكُمْ.', de: 'Friede sei mit euch.' }],
    },
  ],
  grammatik: [
    {
      id: 'g-1-1',
      einheit: 1,
      abschnitt: 1,
      titel: 'Personalpronomen',
      regel: 'أَنا ich',
      erklaerung: ['Erster Absatz.'],
      beispiele: [{ ar: 'أَنا يوسُفُ.', de: 'Ich bin Yūsuf.' }],
      fragen: [],
    },
  ],
});

function summary(patch: Partial<UnitSummary> = {}): UnitSummary {
  return {
    id: 'bayna-yadayk/1',
    course: 'bayna-yadayk',
    unit: 1,
    title: 'Der neue Student',
    state: 'review',
    revision: 3,
    checked: false,
    checkedAt: null,
    checkedBy: null,
    reviewNote: null,
    publishedRevision: 1,
    publishedAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-09T10:00:00.000Z',
    updatedBy: 'chef@example.org',
    counts: { vokabeln: 2, dialoge: 1, grammatik: 1 },
    ...patch,
  };
}

/** The unit with English beside every German text (as drafted by the LLM). */
function withEnglish(unit: UnitContent): UnitContent {
  return {
    ...unit,
    vokabeln: unit.vokabeln.map((v) => ({ ...v, en: `EN ${v.de}` })),
    dialoge: unit.dialoge.map((d) => ({
      ...d,
      zeilen: d.zeilen.map((l) => ({ ...l, en: `EN ${l.de}` })),
    })),
    grammatik: unit.grammatik.map((g) => ({
      ...g,
      beispiele: g.beispiele.map((e) => ({ ...e, en: `EN ${e.de}` })),
    })),
  };
}

interface Sent {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

/** A fake CMS: one unit under review, one published; records every request. */
function fakeApi(
  unit: Partial<UnitSummary> = {},
  english: { draft?: boolean; changed?: string[] } = {}
) {
  const sent: Sent[] = [];
  let detail: UnitDetail = {
    ...summary(unit),
    draft: content(),
    published: { ...content(), einheit: 1, status: 'entwurf' },
    changes: {
      added: ['v-new'],
      removed: [],
      changed: ['g-1-1'],
      textChanged: false,
      english: english.changed ?? [],
    },
  };
  if (english.draft) detail = { ...detail, draft: withEnglish(detail.draft) };
  const other = summary({
    id: 'bayna-yadayk/2',
    unit: 2,
    title: 'Die Familie',
    state: 'published',
    revision: 1,
  });
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : null;
    sent.push({ method, path, body });
    if (path === '/api/v1/content/units')
      return Response.json({ units: [other, detail] });
    if (method === 'GET') return Response.json(detail);
    if (path.endsWith('/check')) {
      detail = { ...detail, checked: true, checkedBy: 'lehrerin@example.org' };
    } else if (path.endsWith('/return')) {
      detail = { ...detail, state: 'draft', reviewNote: String(body?.note) };
    } else if (path.endsWith('/draft')) {
      if (body?.revision !== detail.revision) {
        return Response.json({ error: 'stale_revision' }, { status: 409 });
      }
      detail = {
        ...detail,
        state: 'draft',
        revision: detail.revision + 1,
        draft: body.content as UnitContent,
      };
    } else if (path.endsWith('/publish')) {
      detail = { ...detail, state: 'published', publishedRevision: detail.revision };
    } else if (path.endsWith('/submit')) {
      detail = { ...detail, state: 'review' };
    } else if (path.endsWith('/translate')) {
      detail = {
        ...detail,
        revision: detail.revision + 1,
        draft: withEnglish(detail.draft),
      };
      return Response.json({ revision: detail.revision, filled: 4, remaining: 0 });
    }
    return Response.json({ revision: detail.revision });
  });
  return { api: new ContentApi(fetchImpl as typeof fetch), sent };
}

describe('Inhalte prüfen (teachers)', () => {
  beforeEach(() => {
    role.current = 'teacher';
  });

  it('is only for teachers and admins', () => {
    role.current = 'student';
    render(
      <MemoryRouter>
        <ContentReview api={fakeApi().api} />
      </MemoryRouter>
    );
    expect(screen.getByText('Diese Seite ist für Lehrkräfte.')).toBeTruthy();
  });

  it('lists units under review first and checks one', async () => {
    const { api, sent } = fakeApi();
    render(
      <MemoryRouter initialEntries={['/inhalte']}>
        <ContentReview api={api} />
      </MemoryRouter>
    );
    const waiting = await screen.findByRole('region', { name: 'Zur Prüfung' });
    expect(within(waiting).getByText('Einheit 1: Der neue Student')).toBeTruthy();
    const all = screen.getByRole('region', { name: 'Alle Einheiten' });
    expect(within(all).getByText('Einheit 2: Die Familie')).toBeTruthy();

    await userEvent.click(within(waiting).getByRole('button'));
    // What changed comes first; new and changed items are marked.
    await screen.findByText('Neu: v-new');
    expect(screen.getByText('Geändert: g-1-1')).toBeTruthy();
    const newWord = screen.getByText('ǧadīd').closest('tr')!;
    expect(
      within(newWord as HTMLElement).getByText('neu', { selector: '.badge' })
    ).toBeTruthy();
    expect(screen.getByText('geändert', { selector: '.badge' })).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Als geprüft markieren' }));
    await screen.findByText('Als geprüft markiert.');
    expect(sent.find((s) => s.path.endsWith('/check'))).toEqual({
      method: 'POST',
      path: '/api/v1/content/units/bayna-yadayk/1/check',
      body: { revision: 3 },
    });
    expect(await screen.findByRole('button', { name: 'Geprüft' })).toHaveProperty(
      'disabled',
      true
    );
  });

  it('shows English beside German and marks new English to check (16.4)', async () => {
    const { api } = fakeApi({}, { draft: true, changed: ['v-new', 'd-1-1#0'] });
    render(
      <MemoryRouter initialEntries={['/inhalte']}>
        <ContentReview api={api} />
      </MemoryRouter>
    );
    const waiting = await screen.findByRole('region', { name: 'Zur Prüfung' });
    await userEvent.click(within(waiting).getByRole('button'));
    expect(
      await screen.findByText(
        'Englisch neu oder geändert: 2 Texte – bitte gegen Arabisch und Deutsch prüfen'
      )
    ).toBeTruthy();
    const newWord = screen.getByText('ǧadīd').closest('tr')!;
    expect(within(newWord as HTMLElement).getByText('EN neu')).toHaveAttribute(
      'lang',
      'en'
    );
    expect(within(newWord as HTMLElement).getByText('Englisch prüfen')).toBeTruthy();
    // English that did not change carries no mark.
    const oldWord = screen.getByText('ism').closest('tr')!;
    expect(within(oldWord as HTMLElement).getByText('EN Name')).toBeTruthy();
    expect(within(oldWord as HTMLElement).queryByText('Englisch prüfen')).toBeNull();
    expect(screen.getAllByText('Englisch prüfen')).toHaveLength(2);
  });

  it('sends a unit back only with a note', async () => {
    const { api, sent } = fakeApi();
    render(
      <MemoryRouter initialEntries={['/inhalte?unit=bayna-yadayk/1']}>
        <ContentReview api={api} />
      </MemoryRouter>
    );
    const back = await screen.findByRole('button', { name: 'Zurückgeben' });
    expect(back).toHaveProperty('disabled', true);
    await userEvent.type(screen.getByRole('textbox'), 'Plural von اسم fehlt ein Vokal.');
    await userEvent.click(back);
    await screen.findByText('Zurückgegeben.');
    expect(sent.find((s) => s.path.endsWith('/return'))?.body).toEqual({
      revision: 3,
      note: 'Plural von اسم fehlt ein Vokal.',
    });
    expect(
      await screen.findByText('Notiz zur Prüfung: Plural von اسم fehlt ein Vokal.')
    ).toBeTruthy();
  });
});

describe('Inhalte im Admin-Bereich', () => {
  beforeEach(() => {
    role.current = 'admin';
  });

  async function openUnit(api: ContentApi) {
    render(
      <MemoryRouter>
        <ContentAdmin api={api} />
      </MemoryRouter>
    );
    const select = await screen.findByRole('combobox', { name: 'Einheit' });
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
    await userEvent.selectOptions(select, 'bayna-yadayk/1');
    await screen.findByRole('region', { name: 'Wörter' });
  }

  it('saves an edited draft against the revision it loaded', async () => {
    const { api, sent } = fakeApi({ state: 'draft' });
    await openUnit(api);
    const save = screen.getByRole('button', { name: 'Speichern' });
    expect(save).toHaveProperty('disabled', true);

    const words = screen.getByRole('region', { name: 'Wörter' });
    const german = within(words).getAllByLabelText('Deutsch')[0]!;
    await userEvent.clear(german);
    await userEvent.type(german, 'Name, Nomen');
    // Saved IDs are fixed; there is no ID field for them.
    expect(
      within(words).queryByLabelText('Kennung (fest nach dem Speichern)')
    ).toBeNull();
    // Unsaved changes cannot be submitted.
    expect(screen.getByRole('button', { name: 'Zur Prüfung geben' })).toHaveProperty(
      'disabled',
      true
    );

    await userEvent.click(save);
    await screen.findByText('Entwurf gespeichert.');
    const put = sent.find((s) => s.method === 'PUT')!;
    expect(put.path).toBe('/api/v1/content/units/bayna-yadayk/1/draft');
    expect(put.body?.revision).toBe(3);
    expect((put.body?.content as UnitContent).vokabeln[0]!.de).toBe('Name, Nomen');
  });

  it('keeps line breaks while typing an explanation and adds a new word with an ID', async () => {
    const { api, sent } = fakeApi({ state: 'draft' });
    await openUnit(api);
    const grammar = screen.getByRole('region', { name: 'Grammatik' });
    const explanation = within(grammar).getByLabelText(
      'Erklärung (ein Absatz pro Zeile)'
    );
    await userEvent.click(explanation);
    await userEvent.keyboard('{End}{Enter}Zweiter Absatz.');
    expect((explanation as HTMLTextAreaElement).value).toBe(
      'Erster Absatz.\nZweiter Absatz.'
    );

    const words = screen.getByRole('region', { name: 'Wörter' });
    await userEvent.click(within(words).getByRole('button', { name: 'Wort hinzufügen' }));
    await userEvent.type(
      within(words).getByLabelText('Kennung (fest nach dem Speichern)'),
      'v-kitab'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText('Entwurf gespeichert.');
    const saved = sent.find((s) => s.method === 'PUT')!.body!.content as UnitContent;
    expect(saved.grammatik[0]!.erklaerung).toEqual(['Erster Absatz.', 'Zweiter Absatz.']);
    expect(saved.vokabeln.at(-1)).toMatchObject({ id: 'v-kitab', einheit: 1 });
  });

  it('drafts English with the AI and edits it by hand (16.4)', async () => {
    const { api, sent } = fakeApi({ state: 'draft' });
    await openUnit(api);
    const draft = screen.getByRole('button', {
      name: 'Englisch entwerfen (KI) · 4 Texte offen',
    });
    await userEvent.click(draft);
    await screen.findByText(/4 englische Texte entworfen, 0 noch offen/);
    expect(sent.find((s) => s.path.endsWith('/translate'))).toEqual({
      method: 'POST',
      path: '/api/v1/content/units/bayna-yadayk/1/translate',
      body: { revision: 3 },
    });
    expect(
      await screen.findByRole('button', {
        name: 'Englisch entwerfen (KI) · 0 Texte offen',
      })
    ).toHaveProperty('disabled', true);

    // The drafted English is in the editor and can be corrected before the review.
    const words = screen.getByRole('region', { name: 'Wörter' });
    const english = within(words).getAllByLabelText('Englisch')[0]!;
    expect(english).toHaveValue('EN Name');
    await userEvent.clear(english);
    await userEvent.type(english, 'name');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    await screen.findByText('Entwurf gespeichert.');
    const saved = sent.find((s) => s.method === 'PUT')!.body!.content as UnitContent;
    expect(saved.vokabeln[0]!.en).toBe('name');
    expect(saved.grammatik[0]!.beispiele[0]!.en).toBe('EN Ich bin Yūsuf.');
  });

  it('reads grammar examples with optional English', () => {
    expect(parseExample('أَنا يوسُفُ. | Ich bin Yūsuf.')).toEqual({
      ar: 'أَنا يوسُفُ.',
      de: 'Ich bin Yūsuf.',
    });
    expect(parseExample('أَنا يوسُفُ. | Ich bin Yūsuf. | I am Yusuf.')).toEqual({
      ar: 'أَنا يوسُفُ.',
      de: 'Ich bin Yūsuf.',
      en: 'I am Yusuf.',
    });
  });

  it('asks before dropping unsaved edits when switching units', async () => {
    const { api } = fakeApi({ state: 'draft' });
    await openUnit(api);
    const words = screen.getByRole('region', { name: 'Wörter' });
    await userEvent.type(within(words).getAllByLabelText('Hinweis')[0]!, 'neu');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    const select = screen.getByRole('combobox', { name: 'Einheit' });
    await userEvent.selectOptions(select, 'bayna-yadayk/2');
    expect(confirm).toHaveBeenCalledWith(
      'Ungespeicherte Änderungen verwerfen und Einheit wechseln?'
    );
    expect((select as HTMLSelectElement).value).toBe('bayna-yadayk/1');
    confirm.mockRestore();
  });

  it('asks before publishing a unit no teacher checked', async () => {
    const { api, sent } = fakeApi({ state: 'review' });
    await openUnit(api);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await userEvent.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    expect(confirm).toHaveBeenCalled();
    expect(sent.some((s) => s.path.endsWith('/publish'))).toBe(false);

    confirm.mockReturnValueOnce(true);
    await userEvent.click(screen.getByRole('button', { name: 'Veröffentlichen' }));
    await screen.findByText('Veröffentlicht.');
    expect(sent.find((s) => s.path.endsWith('/publish'))?.body).toEqual({ revision: 3 });
    confirm.mockRestore();
  });

  it('shows why a save failed', async () => {
    const { api } = fakeApi({ state: 'draft' });
    const failing = new ContentApi(
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
        init?.method === 'PUT'
          ? Response.json(
              { error: 'invalid_content', issues: ['vokabeln.2.id: invalid id'] },
              { status: 422 }
            )
          : (api as unknown as { fetchImpl: typeof fetch }).fetchImpl(input, init)
      ) as typeof fetch
    );
    await openUnit(failing);
    const words = screen.getByRole('region', { name: 'Wörter' });
    await userEvent.type(within(words).getAllByLabelText('Hinweis')[0]!, 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(
      await screen.findByText('Der Inhalt ist so nicht gültig: vokabeln.2.id: invalid id')
    ).toBeTruthy();
  });

  it('describes CMS entries in the audit log', () => {
    const entry = (
      action: string,
      details: Record<string, unknown> = {}
    ): AuditEntry => ({
      id: '1',
      actorId: null,
      actorEmail: null,
      action,
      targetType: 'content_unit',
      targetId: 'bayna-yadayk/1',
      details,
      createdAt: '2026-10-09T10:00:00.000Z',
    });
    expect(
      describeAudit(
        entry('content.unit_saved', { counts: { added: 1, changed: 2, removed: 0 } })
      )
    ).toBe('Entwurf gespeichert (+1 neu, 2 geändert, −0 entfernt)');
    expect(describeAudit(entry('content.unit_returned', { note: 'Bitte prüfen' }))).toBe(
      'Einheit zurückgegeben: Bitte prüfen'
    );
    expect(describeAudit(entry('content.units_seeded', { units: ['a', 'b'] }))).toBe(
      'Inhalte übernommen: 2 Einheit(en)'
    );
    expect(describeAudit(entry('content.unit_published'))).toBe('Einheit veröffentlicht');
  });
});
