/**
 * Admin AI page (story 9.5): budget and spend this month, daily quotas, the model for each
 * task (order = fallback order), a test call, and the last 30 days by task and model.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dateLocale } from '@/i18n/format';
import {
  AI_TASKS,
  AiAdminApi,
  formatUsd,
  PROVIDER_LABELS,
  taskLabel,
  type AiOverview,
  type AiRoute,
  type Capability,
  type Effort,
  type ProviderId,
  type RouteDraft,
  type TryResult,
} from '@/services/admin/aiAdminApi';

const CAPABILITIES: Capability[] = ['streaming', 'structuredOutput', 'tools', 'vision'];

const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const PROVIDERS: ProviderId[] = ['anthropic', 'openrouter', 'huggingface', 'mistral'];

const toDraft = ({ task: _task, position: _position, ...rest }: AiRoute): RouteDraft =>
  rest;

export function AiAdmin({ api: injected }: { api?: AiAdminApi }) {
  const { t } = useTranslation('adminAi');
  const api = useMemo(() => injected ?? new AiAdminApi(), [injected]);
  const [data, setData] = useState<AiOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.overview();
    if (result.ok) {
      setData(result.value);
      setError(null);
    } else setError(result.message);
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <span className="feedback-bad">{error}</span>;
  if (!data) return <p className="muted">{t('loading')}</p>;

  const tasks = [...new Set<string>([...AI_TASKS, ...data.routes.map((r) => r.task)])];
  return (
    <div className="stack">
      <Budget data={data} />
      <Quotas api={api} data={data} onSaved={load} />
      <h2 style={{ margin: '0.5rem 0 0' }}>{t('routesTitle')}</h2>
      <p className="muted" style={{ margin: 0 }}>
        {t('routesIntro')}
      </p>
      {tasks.map((task) => (
        <TaskRoutes
          key={task}
          api={api}
          task={task}
          routes={data.routes.filter((r) => r.task === task)}
          configured={data.providers}
          onSaved={load}
        />
      ))}
      <TryRoute api={api} tasks={tasks} onDone={load} />
      <Usage data={data} />
    </div>
  );
}

function Budget({ data }: { data: AiOverview }) {
  const { t } = useTranslation('adminAi');
  const { budget, providers } = data;
  const percent =
    budget.budgetMicro > 0
      ? Math.min(100, (budget.spentMicro / budget.budgetMicro) * 100)
      : 100;
  return (
    <div className="card stack">
      <strong>{t('budget.title')}</strong>
      <span>
        {t('budget.spent', {
          spent: formatUsd(budget.spentMicro),
          budget: formatUsd(budget.budgetMicro),
          percent: percent.toFixed(0),
          mode: t(`modes.${budget.mode}`),
        })}
      </span>
      <div
        role="progressbar"
        aria-label={t('budget.progress')}
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ height: 8, borderRadius: 4, background: 'var(--surface-2, #eee)' }}
      >
        <div
          style={{
            width: `${percent}%`,
            height: '100%',
            borderRadius: 4,
            background:
              budget.mode === 'normal'
                ? 'var(--accent, #2a7)'
                : budget.mode === 'economy'
                  ? '#d90'
                  : '#c33',
          }}
        />
      </div>
      <span className="muted">
        {t('budget.providers', {
          list: PROVIDERS.map(
            (p) =>
              `${PROVIDER_LABELS[p]} ${providers.includes(p) ? '✓' : t('budget.noKey')}`
          ).join(' · '),
        })}
      </span>
    </div>
  );
}

function Quotas({
  api,
  data,
  onSaved,
}: {
  api: AiAdminApi;
  data: AiOverview;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation(['adminAi', 'common']);
  const { settings } = data;
  const [budgetUsd, setBudgetUsd] = useState(
    String(settings.monthlyBudgetMicro / 1_000_000)
  );
  const [percent, setPercent] = useState(String(settings.downgradePercent));
  const [turns, setTurns] = useState({
    student: settings.dailyTurns.student?.toString() ?? '',
    teacher: settings.dailyTurns.teacher?.toString() ?? '',
    admin: settings.dailyTurns.admin?.toString() ?? '',
  });
  const [message, setMessage] = useState<string | null>(null);
  const limit = (value: string) => (value.trim() === '' ? null : Number(value));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await api.saveSettings({
      monthlyBudgetUsd: Number(budgetUsd),
      downgradePercent: Number(percent),
      dailyTurns: {
        student: limit(turns.student),
        teacher: limit(turns.teacher),
        admin: limit(turns.admin),
      },
    });
    setMessage(result.ok ? t('common:saved') : result.message);
    if (result.ok) await onSaved();
  };

  const turnField = (key: keyof typeof turns, label: string) => (
    <label className="stack" style={{ gap: 2 }}>
      <span className="muted">{label}</span>
      <input
        className="input"
        inputMode="numeric"
        placeholder={t('quotas.unlimited')}
        value={turns[key]}
        onChange={(e) => setTurns({ ...turns, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <form className="card stack" onSubmit={(e) => void save(e)}>
      <strong>{t('quotas.title')}</strong>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <label className="stack" style={{ gap: 2 }}>
          <span className="muted">{t('quotas.monthly')}</span>
          <input
            className="input"
            inputMode="decimal"
            value={budgetUsd}
            onChange={(e) => setBudgetUsd(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="muted">{t('quotas.economyFrom')}</span>
          <input
            className="input"
            inputMode="numeric"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </label>
      </div>
      <span>{t('quotas.turns')}</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        {turnField('student', t('quotas.student'))}
        {turnField('teacher', t('quotas.teacher'))}
        {turnField('admin', t('quotas.admin'))}
      </div>
      <div className="row">
        <button className="btn btn-primary" type="submit">
          {t('common:save')}
        </button>
        {message && <span className="muted">{message}</span>}
      </div>
    </form>
  );
}

function TaskRoutes({
  api,
  task,
  routes,
  configured,
  onSaved,
}: {
  api: AiAdminApi;
  task: string;
  routes: AiRoute[];
  configured: ProviderId[];
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation(['adminAi', 'common']);
  const [drafts, setDrafts] = useState<RouteDraft[]>(() => routes.map(toDraft));
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => setDrafts(routes.map(toDraft)), [routes]);

  const update = (i: number, change: Partial<RouteDraft>) =>
    setDrafts(drafts.map((d, j) => (j === i ? { ...d, ...change } : d)));
  const move = (i: number, by: -1 | 1) => {
    const next = [...drafts];
    const [item] = next.splice(i, 1);
    next.splice(i + by, 0, item!);
    setDrafts(next);
  };
  const add = () =>
    setDrafts([
      ...drafts,
      {
        provider: 'anthropic',
        model: 'claude-haiku-4-5',
        effort: null,
        maxTokens: 1024,
        capabilities: ['streaming', 'structuredOutput', 'tools', 'vision'],
        premium: false,
        enabled: true,
        price: null,
      },
    ]);

  const save = async () => {
    const result = await api.saveRoutes(task, drafts);
    setMessage(result.ok ? t('common:saved') : result.message);
    if (result.ok) await onSaved();
  };

  return (
    <section className="card stack" aria-label={taskLabel(task)}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{taskLabel(task)}</strong>
        <code className="muted">{task}</code>
      </div>
      {drafts.length === 0 && <span className="muted">{t('route.off')}</span>}
      {drafts.map((d, i) => (
        <div
          key={i}
          className="stack"
          style={{ borderTop: '1px solid var(--border, #ddd)', paddingTop: 8 }}
        >
          <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <span className="muted">
              {i === 0 ? t('route.first') : t('route.fallback', { n: i })}
            </span>
            <select
              className="input"
              aria-label={t('route.provider')}
              value={d.provider}
              onChange={(e) => update(i, { provider: e.target.value as ProviderId })}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
            <input
              className="input"
              aria-label={t('route.model')}
              value={d.model}
              onChange={(e) => update(i, { model: e.target.value })}
              style={{ flex: 1, minWidth: 180 }}
            />
            <select
              className="input"
              aria-label={t('route.effort')}
              value={d.effort ?? ''}
              onChange={(e) =>
                update(i, { effort: (e.target.value || null) as Effort | null })
              }
            >
              <option value="">{t('route.effortDefault')}</option>
              {EFFORTS.map((effort) => (
                <option key={effort} value={effort}>
                  {effort}
                </option>
              ))}
            </select>
            <input
              className="input"
              aria-label={t('route.maxTokens')}
              inputMode="numeric"
              value={d.maxTokens}
              onChange={(e) => update(i, { maxTokens: Number(e.target.value) || 1 })}
              style={{ width: 90 }}
            />
          </div>
          <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
            <label>
              <input
                type="checkbox"
                checked={d.enabled}
                onChange={(e) => update(i, { enabled: e.target.checked })}
              />{' '}
              {t('route.active')}
            </label>
            <label title={t('route.premiumHint')}>
              <input
                type="checkbox"
                checked={d.premium}
                onChange={(e) => update(i, { premium: e.target.checked })}
              />{' '}
              {t('route.premium')}
            </label>
            {CAPABILITIES.map((c) => (
              <label key={c}>
                <input
                  type="checkbox"
                  checked={d.capabilities.includes(c)}
                  onChange={(e) =>
                    update(i, {
                      capabilities: e.target.checked
                        ? [...d.capabilities, c]
                        : d.capabilities.filter((x) => x !== c),
                    })
                  }
                />{' '}
                {t(`capabilities.${c}`)}
              </label>
            ))}
          </div>
          {d.provider !== 'anthropic' && (
            <div className="row" style={{ gap: '0.5rem' }}>
              <span className="muted">{t('route.price')}</span>
              <input
                className="input"
                aria-label={t('route.priceIn')}
                inputMode="decimal"
                value={d.price?.input ?? ''}
                onChange={(e) =>
                  update(i, {
                    price: {
                      input: Number(e.target.value),
                      output: d.price?.output ?? 0,
                    },
                  })
                }
                style={{ width: 80 }}
              />
              <input
                className="input"
                aria-label={t('route.priceOut')}
                inputMode="decimal"
                value={d.price?.output ?? ''}
                onChange={(e) =>
                  update(i, {
                    price: { input: d.price?.input ?? 0, output: Number(e.target.value) },
                  })
                }
                style={{ width: 80 }}
              />
            </div>
          )}
          {!configured.includes(d.provider) && (
            <span className="muted">
              {t('route.noKey', { provider: PROVIDER_LABELS[d.provider] })}
            </span>
          )}
          <div className="row" style={{ gap: '0.5rem' }}>
            <button
              className="btn"
              type="button"
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              ↑
            </button>
            <button
              className="btn"
              type="button"
              disabled={i === drafts.length - 1}
              onClick={() => move(i, 1)}
            >
              ↓
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setDrafts(drafts.filter((_, j) => j !== i))}
            >
              {t('common:remove')}
            </button>
          </div>
        </div>
      ))}
      <div className="row">
        <button
          className="btn"
          type="button"
          onClick={add}
          disabled={drafts.length >= 10}
        >
          {t('route.add')}
        </button>
        <button className="btn btn-primary" type="button" onClick={() => void save()}>
          {t('common:save')}
        </button>
        {message && <span className="muted">{message}</span>}
      </div>
    </section>
  );
}

function TryRoute({
  api,
  tasks,
  onDone,
}: {
  api: AiAdminApi;
  tasks: string[];
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation('adminAi');
  const [task, setTask] = useState(tasks[0] ?? 'tutor.converse');
  const [prompt, setPrompt] = useState(() => t('try.defaultPrompt'));
  const [result, setResult] = useState<TryResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const response = await api.tryRoute(task, prompt);
    setBusy(false);
    if (!response.ok) {
      setResult(null);
      return setMessage(response.message);
    }
    setResult(response.value);
    await onDone();
  };

  return (
    <form className="card stack" onSubmit={(e) => void run(e)}>
      <strong>{t('try.title')}</strong>
      <span className="muted">{t('try.cost')}</span>
      <select
        className="input"
        aria-label={t('try.task')}
        value={task}
        onChange={(e) => setTask(e.target.value)}
      >
        {tasks.map((id) => (
          <option key={id} value={id}>
            {taskLabel(id)}
          </option>
        ))}
      </select>
      <textarea
        className="input"
        aria-label={t('try.prompt')}
        rows={3}
        maxLength={2000}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className="row">
        <button
          className="btn btn-primary"
          type="submit"
          disabled={busy || !prompt.trim()}
        >
          {busy ? t('try.asking') : t('try.send')}
        </button>
        {message && <span className="feedback-bad">{message}</span>}
      </div>
      {result && (
        <div className="stack">
          <p dir="auto" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {result.text}
          </p>
          <span className="muted">
            {t('try.result', {
              provider: PROVIDER_LABELS[result.provider],
              model: result.model,
              ms: result.latencyMs,
              tokensIn: result.usage.inputTokens + result.usage.cacheReadTokens,
              cached: result.usage.cacheReadTokens,
              tokensOut: result.usage.outputTokens,
              cost:
                result.costMicroUsd === null
                  ? t('try.priceUnknown')
                  : formatUsd(result.costMicroUsd),
            })}
          </span>
          {result.attempts.length > 1 && (
            <span className="muted">
              {t('try.attempts', {
                list: result.attempts.map((a) => `${a.model} (${a.outcome})`).join(' → '),
              })}
            </span>
          )}
        </div>
      )}
    </form>
  );
}

function Usage({ data }: { data: AiOverview }) {
  const { t } = useTranslation('adminAi');
  const number = (n: number) => n.toLocaleString(dateLocale());
  if (data.usage.length === 0) {
    return <p className="muted">{t('usage.none')}</p>;
  }
  return (
    <div className="card stack" style={{ overflowX: 'auto' }}>
      <strong>{t('usage.title')}</strong>
      <table>
        <thead>
          <tr>
            <th align="left">{t('usage.task')}</th>
            <th align="left">{t('usage.model')}</th>
            <th align="right">{t('usage.calls')}</th>
            <th align="right">{t('usage.failed')}</th>
            <th align="right">{t('usage.tokens')}</th>
            <th align="right">{t('usage.cached')}</th>
            <th align="right">{t('usage.cost')}</th>
          </tr>
        </thead>
        <tbody>
          {data.usage.map((u) => (
            <tr key={`${u.task}/${u.model}`}>
              <td>{taskLabel(u.task)}</td>
              <td>{u.model ?? '–'}</td>
              <td align="right">{u.calls}</td>
              <td align="right">{u.failed}</td>
              <td align="right">
                {number(u.inputTokens)} / {number(u.outputTokens)}
              </td>
              <td align="right">{number(u.cacheReadTokens)}</td>
              <td align="right">{formatUsd(u.costMicro)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
