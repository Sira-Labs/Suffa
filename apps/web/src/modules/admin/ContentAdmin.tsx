/**
 * The admins' content editor (story 16.1): pick a unit, edit its draft, save it against the
 * revision it was loaded with, give it to the teachers for review and publish it once it came
 * back. Publishing freezes a new content bundle; the app downloads it in the background and
 * uses it from the next start (story 16.2).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  ContentApi,
  errorText,
  stateLabel,
  type UnitContent,
  type UnitDetail,
  type UnitSummary,
} from '@/services/content/contentApi';
import { UnitEditor } from '@/modules/content/UnitEditor';
import { ChangesSummary, UnitStatus } from '@/modules/content/UnitReviewView';

export function ContentAdmin({ api }: { api?: ContentApi }) {
  const { t } = useTranslation('content');
  const client = useMemo(() => api ?? new ContentApi(), [api]);
  const [units, setUnits] = useState<UnitSummary[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Unsaved edits of the open unit: switching units asks first instead of dropping them.
  const dirty = useRef(false);
  const markDirty = useCallback((value: boolean) => {
    dirty.current = value;
  }, []);

  const loadList = useCallback(async () => {
    const result = await client.list();
    if (!result.ok) return setMessage(result.message);
    setUnits(result.value.units);
  }, [client]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  return (
    <section className="stack" aria-label={t('workbench.region')}>
      <p className="muted" style={{ margin: 0 }}>
        {t('workbench.intro')}
      </p>
      {message && <span className="feedback-bad">{message}</span>}
      <label className="stack" style={{ gap: '0.25rem' }}>
        <span className="muted">{t('workbench.unit')}</span>
        <select
          className="input"
          value={selected ?? ''}
          onChange={(e) => {
            if (dirty.current && !window.confirm(t('workbench.confirmSwitch'))) {
              return;
            }
            dirty.current = false;
            setSelected(e.target.value || null);
          }}
        >
          <option value="">{t('workbench.choose')}</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {t(u.checked ? 'workbench.optionChecked' : 'workbench.option', {
                unit: u.unit,
                title: u.title,
                state: stateLabel(u.state),
              })}
            </option>
          ))}
        </select>
      </label>
      {selected && (
        <UnitWorkbench
          key={selected}
          api={client}
          id={selected}
          onChanged={loadList}
          onDirty={markDirty}
        />
      )}
    </section>
  );
}

function UnitWorkbench({
  api,
  id,
  onChanged,
  onDirty,
}: {
  api: ContentApi;
  id: string;
  onChanged: () => Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const { t } = useTranslation(['content', 'common']);
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [draft, setDraft] = useState<UnitContent | null>(null);
  const [message, setMessage] = useState<{ text: string; good?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const result = await api.get(id);
    if (!result.ok) return setMessage({ text: result.message });
    setUnit(result.value);
    setDraft(result.value.draft);
  }, [api, id]);

  useEffect(() => {
    void load();
  }, [load]);

  // IDs saved for this unit stay fixed (SRS cards point at them).
  const savedIds = useMemo(() => {
    if (!unit) return new Set<string>();
    const all = [unit.draft, unit.published].flatMap((c) =>
      c ? [...c.vokabeln, ...c.dialoge, ...c.grammatik].map((item) => item.id) : []
    );
    return new Set(all);
  }, [unit]);

  const dirty = Boolean(
    unit && draft && JSON.stringify(draft) !== JSON.stringify(unit.draft)
  );
  useEffect(() => onDirty(dirty), [dirty, onDirty]);

  if (!unit || !draft) {
    return message ? <span className="feedback-bad">{message.text}</span> : null;
  }

  const run = async (
    call: () => ReturnType<ContentApi['step']>,
    done: string
  ): Promise<void> => {
    setBusy(true);
    const result = await call().finally(() => setBusy(false));
    if (!result.ok) return setMessage({ text: errorText(result) });
    setMessage({ text: done, good: true });
    await Promise.all([load(), onChanged()]);
  };

  const publish = () => {
    if (!unit.checked && !window.confirm(t('workbench.confirmPublish'))) {
      return;
    }
    void run(() => api.step(unit.id, 'publish', unit.revision), t('workbench.published'));
  };

  return (
    <div className="stack">
      <UnitStatus unit={unit} />
      {unit.reviewNote && (
        <p className="feedback-warn" style={{ margin: 0 }}>
          {t('workbench.returnedNote', { note: unit.reviewNote })}
        </p>
      )}
      <div className="card stack">
        <strong>{t('workbench.againstPublished')}</strong>
        <ChangesSummary changes={unit.changes} />
        <Link to={`/inhalte?unit=${encodeURIComponent(unit.id)}`}>
          {t('workbench.openReview')}
        </Link>
      </div>
      <div className="row cms-actions" style={{ flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !dirty}
          onClick={() =>
            void run(
              () => api.saveDraft(unit.id, unit.revision, draft),
              t('workbench.saved')
            )
          }
        >
          {t('common:save')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => setDraft(unit.draft)}
          hidden={!dirty}
        >
          {t('workbench.discard')}
        </button>
        <button
          type="button"
          className="btn"
          disabled={busy || dirty || unit.state === 'review'}
          onClick={() =>
            void run(
              () => api.step(unit.id, 'submit', unit.revision),
              t('workbench.submitted')
            )
          }
        >
          {t('workbench.submit')}
        </button>
        <button
          type="button"
          className="btn btn-accent"
          disabled={busy || dirty || unit.state !== 'review'}
          onClick={publish}
        >
          {t('workbench.publish')}
        </button>
      </div>
      {message && (
        <span className={message.good ? 'feedback-good' : 'feedback-bad'} role="status">
          {message.text}
        </span>
      )}
      <UnitEditor
        unit={unit.unit}
        content={draft}
        savedIds={savedIds}
        onChange={setDraft}
      />
    </div>
  );
}
