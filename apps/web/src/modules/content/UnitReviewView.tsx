/**
 * Read-only view of a unit draft for review (story 16.1): what changed against the published
 * unit first, then the words, dialogues and grammar points with "neu" / "geändert" marks.
 */
import { useTranslation } from 'react-i18next';
import { dateLocale } from '@/i18n/format';
import type {
  ItemChanges,
  UnitContent,
  UnitSummary,
} from '@/services/content/contentApi';
import { stateLabel } from '@/services/content/contentApi';

export function UnitStatus({ unit }: { unit: UnitSummary }) {
  const { t } = useTranslation('content');
  const when = new Date(unit.updatedAt).toLocaleString(dateLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
      <span className="badge">{stateLabel(unit.state)}</span>
      <span className={`badge${unit.checked ? ' badge-done' : ''}`}>
        {unit.checked ? t('status.checked') : t('status.unchecked')}
      </span>
      <span className="muted" style={{ fontSize: '0.85rem' }}>
        {t('status.revision', { revision: unit.revision })}
        {unit.publishedRevision !== null &&
          t('status.published', { revision: unit.publishedRevision })}
        {t('status.updated', { when })}
        {unit.updatedBy && t('status.by', { who: unit.updatedBy })}
      </span>
    </div>
  );
}

export function ChangesSummary({ changes }: { changes: ItemChanges }) {
  const { t } = useTranslation('content');
  const { added, removed, changed, textChanged } = changes;
  if (!added.length && !removed.length && !changed.length && !textChanged) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        {t('changes.none')}
      </p>
    );
  }
  return (
    <ul
      className="stack"
      style={{ margin: 0, paddingInlineStart: '1.2rem', gap: '0.25rem' }}
    >
      {added.length > 0 && <li>{t('changes.added', { ids: added.join(', ') })}</li>}
      {changed.length > 0 && <li>{t('changes.changed', { ids: changed.join(', ') })}</li>}
      {removed.length > 0 && <li>{t('changes.removed', { ids: removed.join(', ') })}</li>}
      {textChanged && <li>{t('changes.text')}</li>}
    </ul>
  );
}

function Mark({ id, changes }: { id: string; changes: ItemChanges }) {
  const { t } = useTranslation('content');
  if (changes.added.includes(id)) {
    return <span className="badge badge-done">{t('changes.markNew')}</span>;
  }
  if (changes.changed.includes(id)) {
    return <span className="badge">{t('changes.markChanged')}</span>;
  }
  return null;
}

export function UnitReviewView({
  content,
  changes,
}: {
  content: UnitContent;
  changes: ItemChanges;
}) {
  const { t } = useTranslation('content');
  return (
    <div className="stack">
      <section className="card stack" aria-label={t('changes.title')}>
        <h2 style={{ margin: 0 }}>{t('changes.title')}</h2>
        <ChangesSummary changes={changes} />
      </section>
      {content.kulturnotiz && (
        <section className="card stack" aria-label={t('view.cultureNote')}>
          <h2 style={{ margin: 0 }}>{t('view.cultureNote')}</h2>
          <p style={{ margin: 0 }}>{content.kulturnotiz}</p>
        </section>
      )}
      <section className="card stack" aria-label={t('view.words')}>
        <h2 style={{ margin: 0 }}>
          {t('view.wordsCount', { n: content.vokabeln.length })}
        </h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('view.arabic')}</th>
                <th>{t('view.transliteration')}</th>
                <th>{t('view.german')}</th>
                <th>{t('view.root')}</th>
                <th>{t('view.plural')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {content.vokabeln.map((word) => (
                <tr key={word.id}>
                  <td className="arabic-inline" lang="ar">
                    {word.ar}
                  </td>
                  <td>{word.tr}</td>
                  <td>
                    {word.de}
                    {word.hinweis && <span className="muted"> – {word.hinweis}</span>}
                  </td>
                  <td className="arabic-inline" lang="ar">
                    {word.wurzel}
                  </td>
                  <td className="arabic-inline" lang="ar">
                    {word.plural ?? '–'}
                  </td>
                  <td>
                    <Mark id={word.id} changes={changes} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card stack" aria-label={t('view.dialogues')}>
        <h2 style={{ margin: 0 }}>
          {t('view.dialoguesCount', { n: content.dialoge.length })}
        </h2>
        {content.dialoge.map((dialog) => (
          <article key={dialog.id} className="stack" style={{ gap: '0.35rem' }}>
            <h3 style={{ margin: 0 }}>
              <span className="arabic-inline" lang="ar">
                {dialog.titel}
              </span>{' '}
              <Mark id={dialog.id} changes={changes} />
            </h3>
            {dialog.zeilen.map((line, i) => (
              <p key={i} style={{ margin: 0 }}>
                <span className="arabic-inline" lang="ar">
                  {line.sp}: {line.ar}
                </span>
                <br />
                <span className="muted">{line.de}</span>
              </p>
            ))}
          </article>
        ))}
      </section>
      <section className="card stack" aria-label={t('view.grammar')}>
        <h2 style={{ margin: 0 }}>
          {t('view.grammarCount', { n: content.grammatik.length })}
        </h2>
        {content.grammatik.map((point) => (
          <article key={point.id} className="stack" style={{ gap: '0.35rem' }}>
            <h3 style={{ margin: 0 }}>
              {point.titel} <Mark id={point.id} changes={changes} />
            </h3>
            <p style={{ margin: 0 }}>
              <strong>{point.regel}</strong>
            </p>
            {point.erklaerung.map((text, i) => (
              <p key={i} style={{ margin: 0 }}>
                {text}
              </p>
            ))}
            {point.beispiele.map((example, i) => (
              <p key={i} style={{ margin: 0 }}>
                <span className="arabic-inline" lang="ar">
                  {example.ar}
                </span>{' '}
                <span className="muted">{example.de}</span>
              </p>
            ))}
            {point.fragen.length > 0 && (
              <p className="muted" style={{ margin: 0 }}>
                {t('view.questions', { count: point.fragen.length })}
              </p>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
