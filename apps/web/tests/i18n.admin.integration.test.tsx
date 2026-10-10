/**
 * Story 16.3: administration and content review in English. The teachers' review page, the
 * admin tabs, audit log descriptions and API error messages follow the interface language.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { setUiLanguage } from '@/i18n';
import { ContentReview } from '@/modules/content/ContentReview';
import { AiAdmin } from '@/modules/admin/AiAdmin';
import { FeedbackAdmin } from '@/modules/admin/FeedbackAdmin';
import { describeAudit, roleLabel, type AuditEntry } from '@/services/admin/adminApi';
import { AiAdminApi, type AiOverview } from '@/services/admin/aiAdminApi';
import {
  ContentApi,
  type UnitContent,
  type UnitDetail,
} from '@/services/content/contentApi';
import { FeedbackApi, type FeedbackItem } from '@/services/feedback/feedbackApi';

const role = vi.hoisted(() => ({ current: 'teacher' as string | null }));
vi.mock('@/modules/account/useRole', () => ({ useRole: () => role.current }));

const content: UnitContent = {
  titel: 'Der neue Student',
  vokabeln: [
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
  dialoge: [],
  grammatik: [
    {
      id: 'g-1-1',
      einheit: 1,
      abschnitt: 1,
      titel: 'Personalpronomen',
      regel: 'أَنا ich',
      erklaerung: [],
      beispiele: [],
      fragen: [{ id: 'g-1-1#0', frage: 'Wer?', ar: null, antwort: 'أنا', ablenker: [] }],
    },
  ],
};

const unit: UnitDetail = {
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
  counts: { vokabeln: 1, dialoge: 0, grammatik: 1 },
  draft: content,
  published: { ...content, einheit: 1 },
  changes: { added: ['v-new'], removed: [], changed: [], textChanged: false },
};

function contentApi() {
  let detail = unit;
  return new ContentApi(
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === '/api/v1/content/units') return Response.json({ units: [detail] });
      if (init?.method === 'POST') {
        detail = { ...detail, checked: true };
        return Response.json({ revision: detail.revision });
      }
      return Response.json(detail);
    }) as typeof fetch
  );
}

const overview: AiOverview = {
  providers: ['anthropic'],
  routes: [
    {
      task: 'tutor.coach',
      position: 0,
      provider: 'anthropic',
      model: 'claude-haiku-4-5',
      effort: null,
      maxTokens: 800,
      capabilities: ['streaming'],
      premium: false,
      enabled: true,
      price: null,
    },
  ],
  settings: {
    monthlyBudgetMicro: 100_000_000,
    downgradePercent: 80,
    dailyTurns: { student: 30, teacher: null, admin: null },
  },
  budget: { mode: 'economy', spentMicro: 85_000_000, budgetMicro: 100_000_000 },
  usage: [
    {
      task: 'tutor.coach',
      model: 'claude-haiku-4-5',
      calls: 12,
      failed: 1,
      inputTokens: 12_000,
      outputTokens: 2400,
      cacheReadTokens: 48_000,
      costMicro: 28_800,
    },
  ],
};

const audit = (action: string, details: Record<string, unknown> = {}): AuditEntry => ({
  id: '1',
  actorId: 'a',
  actorEmail: 'chef@example.org',
  action,
  targetType: 'user',
  targetId: 'u',
  details,
  createdAt: '2026-10-09T10:00:00.000Z',
});

describe('administration and content review in English (integration)', () => {
  afterEach(async () => {
    await act(() => setUiLanguage('de'));
    localStorage.clear();
    role.current = 'teacher';
  });

  it('shows the review page in English and checks a unit', async () => {
    await act(() => setUiLanguage('en'));
    render(
      <MemoryRouter initialEntries={['/inhalte']}>
        <ContentReview api={contentApi()} />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Review content' })).toBeInTheDocument();
    const waiting = await screen.findByRole('region', { name: 'For review' });
    expect(within(waiting).getByText('Unit 1: Der neue Student')).toBeInTheDocument();
    expect(within(waiting).getByText('In review')).toBeInTheDocument();
    expect(within(waiting).getByText('Not checked')).toBeInTheDocument();
    expect(within(waiting).getByText(/Revision 3 · published: revision 1/)).toBeTruthy();
    expect(screen.getByText('No other units.')).toBeInTheDocument();

    await userEvent.click(within(waiting).getByRole('button'));
    expect(await screen.findByText('New: v-new')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '← All units' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Words (1)' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Transliteration' })).toBeTruthy();
    expect(screen.getByText('new', { selector: '.badge' })).toBeInTheDocument();
    expect(screen.getByText('1 quiz question')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send back' })).toHaveProperty(
      'disabled',
      true
    );
    await userEvent.click(screen.getByRole('button', { name: 'Mark as checked' }));
    expect(await screen.findByText('Marked as checked.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Checked' })).toBeInTheDocument();
  });

  it('follows a language change while the page is open', async () => {
    role.current = 'student';
    render(
      <MemoryRouter>
        <ContentReview api={contentApi()} />
      </MemoryRouter>
    );
    expect(screen.getByText('Diese Seite ist für Lehrkräfte.')).toBeInTheDocument();
    await act(() => setUiLanguage('en'));
    expect(screen.getByText('This page is for teachers.')).toBeInTheDocument();
  });

  it('shows the AI tab in English with English number formats', async () => {
    await act(() => setUiLanguage('en'));
    render(
      <AiAdmin
        api={new AiAdminApi(vi.fn(async () => Response.json(overview)) as typeof fetch)}
      />
    );
    expect(await screen.findByText(/\$85\.00 of \$100\.00 \(85 %\)/)).toBeTruthy();
    expect(screen.getByText(/Economy mode \(low-cost models only\)/)).toBeTruthy();
    expect(screen.getByText(/OpenRouter – \(no key\)/)).toBeTruthy();
    expect(screen.getByRole('progressbar', { name: 'AI budget used' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Weekly plan' })).toBeInTheDocument();
    expect(screen.getByLabelText('Monthly budget (USD)')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Save' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText('48,000')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Calls' })).toBeTruthy();
  });

  it('shows the feedback inbox in English', async () => {
    await act(() => setUiLanguage('en'));
    const items: FeedbackItem[] = [
      {
        id: 'f1',
        kind: 'confusing',
        message: 'Wo ist meine Klasse?',
        page: '/',
        appVersion: '',
        userAgent: 'Test',
        status: 'new',
        createdAt: '2026-10-02T08:00:00.000Z',
        sender: null,
      },
    ];
    const api = new FeedbackApi(
      vi.fn(async () => Response.json({ items, next: null, open: 1 })) as typeof fetch
    );
    render(
      <MemoryRouter>
        <FeedbackAdmin api={api} />
      </MemoryRouter>
    );
    expect(await screen.findByText('1 open report')).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Feedback reports' });
    expect(within(list).getByText('Unclear')).toBeInTheDocument();
    expect(within(list).getByText(/no account/)).toBeInTheDocument();
    expect(within(list).getByText(/version unknown/)).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  it('describes audit entries and API errors in English', async () => {
    await act(() => setUiLanguage('en'));
    expect(
      describeAudit(audit('user.role_changed', { from: 'student', to: 'teacher' }))
    ).toBe('Role changed: Learner → Teacher');
    expect(describeAudit(audit('user.disabled', { endedSessions: 1 }))).toBe(
      'Account disabled (1 session ended)'
    );
    expect(describeAudit(audit('user.disabled', { endedSessions: 2 }))).toBe(
      'Account disabled (2 sessions ended)'
    );
    expect(describeAudit(audit('content.units_seeded', { units: ['a', 'b'] }))).toBe(
      'Content imported: 2 units'
    );
    expect(
      describeAudit(
        audit('content.unit_saved', { counts: { added: 1, changed: 2, removed: 0 } })
      )
    ).toBe('Draft saved (+1 new, 2 changed, −0 removed)');
    expect(
      describeAudit(audit('class.league.settings', { enabled: true, minors: true }))
    ).toBe('Weekly league switched on (class with minors)');
    expect(describeAudit(audit('something.new'))).toBe('something.new');
    expect(roleLabel('admin')).toBe('Admin');

    const failing = new ContentApi(
      vi.fn(async () =>
        Response.json({ error: 'stale_revision' }, { status: 409 })
      ) as typeof fetch
    );
    const result = await failing.saveDraft('bayna-yadayk/1', 1, content);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toBe(
      'The unit has been changed in the meantime. Reload it and then make your change again.'
    );
  });
});
