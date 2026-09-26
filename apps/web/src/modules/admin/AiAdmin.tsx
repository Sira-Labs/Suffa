/**
 * Admin AI page (story 9.5): budget and spend this month, daily quotas, the model for each
 * task (order = fallback order), a test call, and the last 30 days by task and model.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AiAdminApi,
  formatUsd,
  PROVIDER_LABELS,
  TASK_LABELS,
  type AiOverview,
  type AiRoute,
  type Capability,
  type Effort,
  type ProviderId,
  type RouteDraft,
  type TryResult,
} from '@/services/admin/aiAdminApi';

const MODE_LABELS = {
  normal: 'Normal',
  economy: 'Sparmodus (nur günstige Modelle)',
  exhausted: 'Pausiert (Budget aufgebraucht)',
} as const;

const CAPABILITY_LABELS: Record<Capability, string> = {
  streaming: 'Streaming',
  structuredOutput: 'JSON',
  tools: 'Werkzeuge',
  vision: 'Bilder',
};

const EFFORTS: Effort[] = ['low', 'medium', 'high', 'xhigh', 'max'];
const PROVIDERS: ProviderId[] = ['anthropic', 'openrouter', 'huggingface', 'mistral'];

const toDraft = ({ task: _task, position: _position, ...rest }: AiRoute): RouteDraft =>
  rest;

export function AiAdmin({ api: injected }: { api?: AiAdminApi }) {
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
  if (!data) return <p className="muted">Lade …</p>;

  const tasks = [
    ...new Set([...Object.keys(TASK_LABELS), ...data.routes.map((r) => r.task)]),
  ];
  return (
    <div className="stack">
      <Budget data={data} />
      <Quotas api={api} data={data} onSaved={load} />
      <h2 style={{ margin: '0.5rem 0 0' }}>Modelle je Aufgabe</h2>
      <p className="muted" style={{ margin: 0 }}>
        Das erste aktive Modell antwortet; die weiteren springen bei Ausfall ein.
        Änderungen gelten spätestens nach einer Minute.
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
  const { budget, providers } = data;
  const percent =
    budget.budgetMicro > 0
      ? Math.min(100, (budget.spentMicro / budget.budgetMicro) * 100)
      : 100;
  return (
    <div className="card stack">
      <strong>Budget diesen Monat</strong>
      <span>
        {formatUsd(budget.spentMicro)} von {formatUsd(budget.budgetMicro)} (
        {percent.toFixed(0)} %) · {MODE_LABELS[budget.mode]}
      </span>
      <div
        role="progressbar"
        aria-label="Verbrauchtes KI-Budget"
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
        Anbieter:{' '}
        {PROVIDERS.map(
          (p) =>
            `${PROVIDER_LABELS[p]} ${providers.includes(p) ? '✓' : '– (kein Schlüssel)'}`
        ).join(' · ')}
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
    setMessage(result.ok ? 'Gespeichert.' : result.message);
    if (result.ok) await onSaved();
  };

  const turnField = (key: keyof typeof turns, label: string) => (
    <label className="stack" style={{ gap: 2 }}>
      <span className="muted">{label}</span>
      <input
        className="input"
        inputMode="numeric"
        placeholder="unbegrenzt"
        value={turns[key]}
        onChange={(e) => setTurns({ ...turns, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <form className="card stack" onSubmit={(e) => void save(e)}>
      <strong>Budget und Kontingente</strong>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        <label className="stack" style={{ gap: 2 }}>
          <span className="muted">Monatsbudget (USD)</span>
          <input
            className="input"
            inputMode="decimal"
            value={budgetUsd}
            onChange={(e) => setBudgetUsd(e.target.value)}
          />
        </label>
        <label className="stack" style={{ gap: 2 }}>
          <span className="muted">Sparmodus ab (%)</span>
          <input
            className="input"
            inputMode="numeric"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        </label>
      </div>
      <span>Gespräche pro Tag</span>
      <div className="row" style={{ flexWrap: 'wrap', gap: '0.75rem' }}>
        {turnField('student', 'Lernende')}
        {turnField('teacher', 'Lehrkräfte')}
        {turnField('admin', 'Admins')}
      </div>
      <div className="row">
        <button className="btn btn-primary" type="submit">
          Speichern
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
    setMessage(result.ok ? 'Gespeichert.' : result.message);
    if (result.ok) await onSaved();
  };

  return (
    <section className="card stack" aria-label={TASK_LABELS[task] ?? task}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{TASK_LABELS[task] ?? task}</strong>
        <code className="muted">{task}</code>
      </div>
      {drafts.length === 0 && (
        <span className="muted">Kein Modell – Aufgabe ist aus.</span>
      )}
      {drafts.map((d, i) => (
        <div
          key={i}
          className="stack"
          style={{ borderTop: '1px solid var(--border, #ddd)', paddingTop: 8 }}
        >
          <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
            <span className="muted">{i === 0 ? 'Zuerst' : `Ersatz ${i}`}</span>
            <select
              className="input"
              aria-label="Anbieter"
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
              aria-label="Modell"
              value={d.model}
              onChange={(e) => update(i, { model: e.target.value })}
              style={{ flex: 1, minWidth: 180 }}
            />
            <select
              className="input"
              aria-label="Denktiefe"
              value={d.effort ?? ''}
              onChange={(e) =>
                update(i, { effort: (e.target.value || null) as Effort | null })
              }
            >
              <option value="">Denktiefe: Standard</option>
              {EFFORTS.map((effort) => (
                <option key={effort} value={effort}>
                  {effort}
                </option>
              ))}
            </select>
            <input
              className="input"
              aria-label="Max. Tokens"
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
              aktiv
            </label>
            <label title="Wird im Sparmodus übersprungen">
              <input
                type="checkbox"
                checked={d.premium}
                onChange={(e) => update(i, { premium: e.target.checked })}
              />{' '}
              Premium
            </label>
            {(Object.keys(CAPABILITY_LABELS) as Capability[]).map((c) => (
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
                {CAPABILITY_LABELS[c]}
              </label>
            ))}
          </div>
          {d.provider !== 'anthropic' && (
            <div className="row" style={{ gap: '0.5rem' }}>
              <span className="muted">Preis pro Mio. Tokens (USD) Ein/Aus:</span>
              <input
                className="input"
                aria-label="Preis Eingabe"
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
                aria-label="Preis Ausgabe"
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
              ⚠ Für {PROVIDER_LABELS[d.provider]} ist kein Schlüssel gesetzt – wird
              übersprungen.
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
              Entfernen
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
          Modell hinzufügen
        </button>
        <button className="btn btn-primary" type="button" onClick={() => void save()}>
          Speichern
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
  const [task, setTask] = useState(tasks[0] ?? 'tutor.converse');
  const [prompt, setPrompt] = useState(
    'Erkläre kurz den Unterschied zwischen هذا und هذه.'
  );
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
      <strong>Ausprobieren</strong>
      <span className="muted">Kostet echtes Geld und zählt zum Budget.</span>
      <select
        className="input"
        aria-label="Aufgabe zum Ausprobieren"
        value={task}
        onChange={(e) => setTask(e.target.value)}
      >
        {tasks.map((t) => (
          <option key={t} value={t}>
            {TASK_LABELS[t] ?? t}
          </option>
        ))}
      </select>
      <textarea
        className="input"
        aria-label="Frage"
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
          {busy ? 'Frage …' : 'Senden'}
        </button>
        {message && <span className="feedback-bad">{message}</span>}
      </div>
      {result && (
        <div className="stack">
          <p dir="auto" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
            {result.text}
          </p>
          <span className="muted">
            {PROVIDER_LABELS[result.provider]} · {result.model} · {result.latencyMs} ms ·{' '}
            {result.usage.inputTokens + result.usage.cacheReadTokens} Tokens ein (
            {result.usage.cacheReadTokens} aus dem Cache), {result.usage.outputTokens} aus
            ·{' '}
            {result.costMicroUsd === null
              ? 'Preis unbekannt'
              : formatUsd(result.costMicroUsd)}
          </span>
          {result.attempts.length > 1 && (
            <span className="muted">
              Versuche:{' '}
              {result.attempts.map((a) => `${a.model} (${a.outcome})`).join(' → ')}
            </span>
          )}
        </div>
      )}
    </form>
  );
}

function Usage({ data }: { data: AiOverview }) {
  if (data.usage.length === 0) {
    return <p className="muted">In den letzten 30 Tagen gab es keine KI-Aufrufe.</p>;
  }
  return (
    <div className="card stack" style={{ overflowX: 'auto' }}>
      <strong>Letzte 30 Tage</strong>
      <table>
        <thead>
          <tr>
            <th align="left">Aufgabe</th>
            <th align="left">Modell</th>
            <th align="right">Aufrufe</th>
            <th align="right">Fehler</th>
            <th align="right">Tokens ein/aus</th>
            <th align="right">aus Cache</th>
            <th align="right">Kosten</th>
          </tr>
        </thead>
        <tbody>
          {data.usage.map((u) => (
            <tr key={`${u.task}/${u.model}`}>
              <td>{TASK_LABELS[u.task] ?? u.task}</td>
              <td>{u.model ?? '–'}</td>
              <td align="right">{u.calls}</td>
              <td align="right">{u.failed}</td>
              <td align="right">
                {u.inputTokens.toLocaleString('de-DE')} /{' '}
                {u.outputTokens.toLocaleString('de-DE')}
              </td>
              <td align="right">{u.cacheReadTokens.toLocaleString('de-DE')}</td>
              <td align="right">{formatUsd(u.costMicro)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
