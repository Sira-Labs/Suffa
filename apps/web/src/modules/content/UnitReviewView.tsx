/**
 * Read-only view of a unit draft for review (story 16.1): what changed against the published
 * unit first, then the words, dialogues and grammar points with "neu" / "geändert" marks.
 */
import type {
  ItemChanges,
  UnitContent,
  UnitSummary,
} from '@/services/content/contentApi';
import { STATE_LABEL } from '@/services/content/contentApi';

const WHEN = new Intl.DateTimeFormat('de-DE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function UnitStatus({ unit }: { unit: UnitSummary }) {
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: '0.5rem' }}>
      <span className="badge">{STATE_LABEL[unit.state]}</span>
      <span className={`badge${unit.checked ? ' badge-done' : ''}`}>
        {unit.checked ? 'Geprüft' : 'Nicht geprüft'}
      </span>
      <span className="muted" style={{ fontSize: '0.85rem' }}>
        Stand {unit.revision}
        {unit.publishedRevision !== null &&
          ` · veröffentlicht: Stand ${unit.publishedRevision}`}
        {` · zuletzt ${WHEN.format(new Date(unit.updatedAt))}`}
        {unit.updatedBy && ` von ${unit.updatedBy}`}
      </span>
    </div>
  );
}

export function ChangesSummary({ changes }: { changes: ItemChanges }) {
  const { added, removed, changed, textChanged } = changes;
  if (!added.length && !removed.length && !changed.length && !textChanged) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Keine Änderungen gegenüber der veröffentlichten Fassung.
      </p>
    );
  }
  return (
    <ul
      className="stack"
      style={{ margin: 0, paddingInlineStart: '1.2rem', gap: '0.25rem' }}
    >
      {added.length > 0 && <li>Neu: {added.join(', ')}</li>}
      {changed.length > 0 && <li>Geändert: {changed.join(', ')}</li>}
      {removed.length > 0 && <li>Entfernt: {removed.join(', ')}</li>}
      {textChanged && <li>Titel oder Kulturnotiz geändert</li>}
    </ul>
  );
}

function Mark({ id, changes }: { id: string; changes: ItemChanges }) {
  if (changes.added.includes(id)) return <span className="badge badge-done">neu</span>;
  if (changes.changed.includes(id)) return <span className="badge">geändert</span>;
  return null;
}

export function UnitReviewView({
  content,
  changes,
}: {
  content: UnitContent;
  changes: ItemChanges;
}) {
  return (
    <div className="stack">
      <section className="card stack" aria-label="Änderungen">
        <h2 style={{ margin: 0 }}>Änderungen</h2>
        <ChangesSummary changes={changes} />
      </section>
      {content.kulturnotiz && (
        <section className="card stack" aria-label="Kulturnotiz">
          <h2 style={{ margin: 0 }}>Kulturnotiz</h2>
          <p style={{ margin: 0 }}>{content.kulturnotiz}</p>
        </section>
      )}
      <section className="card stack" aria-label="Wörter">
        <h2 style={{ margin: 0 }}>Wörter ({content.vokabeln.length})</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Arabisch</th>
                <th>Umschrift</th>
                <th>Deutsch</th>
                <th>Wurzel</th>
                <th>Plural</th>
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
      <section className="card stack" aria-label="Dialoge">
        <h2 style={{ margin: 0 }}>Dialoge ({content.dialoge.length})</h2>
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
      <section className="card stack" aria-label="Grammatik">
        <h2 style={{ margin: 0 }}>Grammatik ({content.grammatik.length})</h2>
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
                {point.fragen.length} Quizfrage(n)
              </p>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
