/** Admin AI page (story 9.5): budget, model per task editable, quotas, test call. */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AiAdmin } from '@/modules/admin/AiAdmin';
import { AiAdminApi, formatUsd, type AiOverview } from '@/services/admin/aiAdminApi';

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
      capabilities: ['streaming', 'structuredOutput', 'tools', 'vision'],
      premium: false,
      enabled: true,
      price: null,
    },
    {
      task: 'tutor.coach',
      position: 1,
      provider: 'openrouter',
      model: 'meta-llama/llama-3.3-70b-instruct',
      effort: null,
      maxTokens: 800,
      capabilities: ['streaming'],
      premium: false,
      enabled: true,
      price: { input: 0.6, output: 0.8 },
    },
  ],
  settings: {
    monthlyBudgetMicro: 100_000_000,
    downgradePercent: 80,
    dailyTurns: { student: 30, teacher: 100, admin: null },
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

function setup() {
  const requests: { method: string; path: string; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    const method = init?.method ?? 'GET';
    requests.push({
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (method === 'GET') return Response.json(overview);
    if (path === '/api/v1/admin/ai/try') {
      return Response.json({
        text: 'هذا für männliche, هذه für weibliche Wörter.',
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        stopReason: 'end',
        usage: {
          inputTokens: 40,
          outputTokens: 30,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        },
        costMicroUsd: 190,
        latencyMs: 812,
        attempts: [{ provider: 'anthropic', model: 'claude-haiku-4-5', outcome: 'ok' }],
      });
    }
    return new Response(null, { status: 204 });
  });
  render(<AiAdmin api={new AiAdminApi(fetchImpl as typeof fetch)} />);
  return { requests };
}

describe('Admin AI page', () => {
  it('shows spend, mode, providers and the last 30 days', async () => {
    setup();
    expect(await screen.findByText(/\$85\.00 von \$100\.00 \(85 %\)/)).toBeTruthy();
    expect(screen.getByText(/Sparmodus \(nur günstige Modelle\)/)).toBeTruthy();
    expect(screen.getByText(/OpenRouter – \(kein Schlüssel\)/)).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('85');
    const table = screen.getByRole('table');
    expect(within(table).getByText('$0.0288')).toBeTruthy();
    expect(within(table).getByText('48.000')).toBeTruthy();
  });

  it('reorders the models of a task and saves the new order', async () => {
    const { requests } = setup();
    const coach = await screen.findByRole('region', { name: 'Wochenplan' });
    expect(within(coach).getByText(/kein Schlüssel gesetzt/)).toBeTruthy();
    await userEvent.click(within(coach).getAllByRole('button', { name: '↓' })[0]!);
    await userEvent.click(within(coach).getByRole('button', { name: 'Speichern' }));
    const put = requests.find((r) => r.method === 'PUT');
    expect(put?.path).toBe('/api/v1/admin/ai/routes/tutor.coach');
    expect(
      (put?.body as { routes: { model: string }[] }).routes.map((r) => r.model)
    ).toEqual(['meta-llama/llama-3.3-70b-instruct', 'claude-haiku-4-5']);
    expect(await within(coach).findByText('Gespeichert.')).toBeTruthy();
  });

  it('saves budget and quotas, empty meaning unlimited', async () => {
    const { requests } = setup();
    const budget = await screen.findByLabelText('Monatsbudget (USD)');
    await userEvent.clear(budget);
    await userEvent.type(budget, '50');
    const students = screen.getByLabelText('Lernende');
    await userEvent.clear(students);
    await userEvent.type(students, '20');
    const form = budget.closest('form')!;
    await userEvent.click(within(form).getByRole('button', { name: 'Speichern' }));
    expect(requests.find((r) => r.path === '/api/v1/admin/ai/settings')?.body).toEqual({
      monthlyBudgetUsd: 50,
      downgradePercent: 80,
      dailyTurns: { student: 20, teacher: 100, admin: null },
    });
  });

  it('tries a task and shows answer, model, cache use and cost', async () => {
    setup();
    await userEvent.click(await screen.findByRole('button', { name: 'Senden' }));
    expect(await screen.findByText(/هذا für männliche/)).toBeTruthy();
    expect(screen.getByText(/claude-haiku-4-5 · 812 ms/)).toBeTruthy();
    expect(screen.getByText(/\$0\.0002/)).toBeTruthy();
  });

  it('formats small and large amounts', () => {
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(1_234)).toBe('$0.0012');
    expect(formatUsd(12_340_000)).toBe('$12.34');
  });
});
