/**
 * "Inhalte prüfen" (story 16.1): teachers read the course units, check the ones under review
 * or send them back to the editors with a note. Admins see the same page; they edit in the
 * admin area. `?unit=bayna-yadayk/3` opens a unit directly.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useRole } from '@/modules/account/useRole';
import {
  ContentApi,
  errorText,
  type UnitDetail,
  type UnitSummary,
} from '@/services/content/contentApi';
import { UnitReviewView, UnitStatus } from './UnitReviewView';

export function ContentReview({ api }: { api?: ContentApi }) {
  const role = useRole();
  if (role !== 'teacher' && role !== 'admin') {
    return (
      <div className="stack">
        <h1>Inhalte prüfen</h1>
        <p className="muted">Diese Seite ist für Lehrkräfte.</p>
      </div>
    );
  }
  return <Review api={api} />;
}

function Review({ api }: { api?: ContentApi }) {
  const client = useMemo(() => api ?? new ContentApi(), [api]);
  const [params, setParams] = useSearchParams();
  const selected = params.get('unit');
  const [units, setUnits] = useState<UnitSummary[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const result = await client.list();
    if (!result.ok) return setMessage(result.message);
    setUnits(result.value.units);
  }, [client]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const inReview = units?.filter((u) => u.state === 'review') ?? [];
  const select = (id: string | null) =>
    setParams(id ? { unit: id } : {}, { replace: false });

  return (
    <div className="stack">
      <h1>Inhalte prüfen</h1>
      <p className="muted" style={{ margin: 0 }}>
        Einheiten, die zur Prüfung gegeben wurden, stehen oben. Markiere sie als geprüft
        oder gib sie mit einer Notiz zurück.
      </p>
      {message && <span className="feedback-bad">{message}</span>}
      {selected ? (
        <UnitPanel
          api={client}
          id={selected}
          onBack={() => select(null)}
          onChanged={loadList}
        />
      ) : (
        units && (
          <>
            <UnitList
              label="Zur Prüfung"
              units={inReview}
              empty="Gerade wartet keine Einheit auf deine Prüfung."
              onSelect={select}
            />
            <UnitList
              label="Alle Einheiten"
              units={units.filter((u) => u.state !== 'review')}
              empty="Keine weiteren Einheiten."
              onSelect={select}
            />
          </>
        )
      )}
    </div>
  );
}

function UnitList({
  label,
  units,
  empty,
  onSelect,
}: {
  label: string;
  units: UnitSummary[];
  empty: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="stack" aria-label={label}>
      <h2 className="eyebrow">{label}</h2>
      {units.length === 0 && <p className="muted">{empty}</p>}
      <ul className="feed-list">
        {units.map((unit) => (
          <li key={unit.id}>
            <button
              type="button"
              className="card stack cms-unit-button"
              onClick={() => onSelect(unit.id)}
            >
              <strong>
                Einheit {unit.unit}: {unit.title}
              </strong>
              <UnitStatus unit={unit} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UnitPanel({
  api,
  id,
  onBack,
  onChanged,
}: {
  api: ContentApi;
  id: string;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [message, setMessage] = useState<{ text: string; good?: boolean } | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api.get(id);
    if (!result.ok) return setMessage({ text: result.message });
    setUnit(result.value);
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (
    run: () => ReturnType<ContentApi['step']>,
    done: string
  ): Promise<void> => {
    setBusy(true);
    const result = await run().finally(() => setBusy(false));
    if (!result.ok) return setMessage({ text: errorText(result) });
    setMessage({ text: done, good: true });
    setNote('');
    await Promise.all([load(), onChanged()]);
  };

  return (
    <div className="stack">
      <button
        type="button"
        className="btn"
        style={{ alignSelf: 'flex-start' }}
        onClick={onBack}
      >
        ← Alle Einheiten
      </button>
      {message && (
        <span className={message.good ? 'feedback-good' : 'feedback-bad'} role="status">
          {message.text}
        </span>
      )}
      {unit && (
        <>
          <h2 style={{ margin: 0 }}>
            Einheit {unit.unit}: {unit.title}
          </h2>
          <UnitStatus unit={unit} />
          {unit.reviewNote && (
            <p className="feedback-warn" style={{ margin: 0 }}>
              Notiz zur Prüfung: {unit.reviewNote}
            </p>
          )}
          {unit.state === 'review' && (
            <section className="card stack" aria-label="Prüfung">
              <h2 style={{ margin: 0 }}>Prüfung</h2>
              <div className="row" style={{ flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy || unit.checked}
                  onClick={() =>
                    void act(
                      () => api.step(unit.id, 'check', unit.revision),
                      'Als geprüft markiert.'
                    )
                  }
                >
                  {unit.checked ? 'Geprüft' : 'Als geprüft markieren'}
                </button>
              </div>
              <label className="stack" style={{ gap: '0.25rem' }}>
                <span className="muted">
                  Oder zurückgeben, mit einer Notiz für die Redaktion:
                </span>
                <textarea
                  className="input cms-textarea"
                  rows={3}
                  value={note}
                  maxLength={2000}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn"
                style={{ alignSelf: 'flex-start' }}
                disabled={busy || !note.trim()}
                onClick={() =>
                  void act(
                    () => api.returnToDraft(unit.id, unit.revision, note.trim()),
                    'Zurückgegeben.'
                  )
                }
              >
                Zurückgeben
              </button>
            </section>
          )}
          <UnitReviewView content={unit.draft} changes={unit.changes} />
        </>
      )}
    </div>
  );
}
