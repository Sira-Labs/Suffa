/**
 * Class assignments (story 8.5): the teacher sets a unit (its test) or a recording (listen to
 * it) with a due date and sees how many are done; learners see what is open, what is done,
 * and where to go.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { InteractiveApi, type Assignment } from '@/services/media/interactiveApi';
import { MediaApi, type MediaItem } from '@/services/media/mediaApi';

const DATE = new Intl.DateTimeFormat('de-DE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/** Where an assignment is done. */
export function assignmentLink(
  classId: string,
  a: Pick<Assignment, 'kind' | 'ref'>
): string {
  return a.kind === 'unit'
    ? `/units/${a.ref}`
    : `/classes/${classId}/recordings/${a.ref}`;
}

/** End of the chosen local day, as an ISO instant. */
export function endOfDay(date: string): string {
  const d = new Date(`${date}T23:59:00`);
  return d.toISOString();
}

export function Assignments({ classId, teacher }: { classId: string; teacher: boolean }) {
  const api = useMemo(() => new InteractiveApi(), []);
  const [items, setItems] = useState<Assignment[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.assignments(classId);
    if (result.ok) setItems(result.value.assignments);
    else setMessage(result.message);
  }, [api, classId]);

  useEffect(() => {
    void load();
  }, [load]);

  const now = Date.now();
  return (
    <section className="card stack" aria-labelledby="assignments-title">
      <h2 id="assignments-title" className="eyebrow">
        Klassenaufgaben
      </h2>
      {teacher && <AssignmentForm api={api} classId={classId} onAdded={load} />}
      {message && <span className="feedback-bad">{message}</span>}
      {items?.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {teacher ? 'Noch keine Aufgaben gestellt.' : 'Gerade keine Aufgaben.'}
        </p>
      )}
      <ul className="feed-list">
        {items?.map((a) => {
          const overdue = Date.parse(a.dueAt) < now;
          return (
            <li
              key={a.id}
              className="feed-item row"
              style={{ justifyContent: 'space-between' }}
            >
              <span className="stack" style={{ gap: 0 }}>
                <Link to={assignmentLink(classId, a)}>
                  {a.done ? '✓ ' : ''}
                  {a.title}
                </Link>
                <span
                  className={overdue && !a.done ? 'feedback-bad' : 'muted'}
                  style={{ fontSize: '0.85rem' }}
                >
                  bis {DATE.format(new Date(a.dueAt))}
                  {teacher && ` · ${a.doneCount}/${a.learners} erledigt`}
                </span>
              </span>
              {teacher && (
                <button
                  className="btn btn-small"
                  onClick={() => void api.removeAssignment(classId, a.id).then(load)}
                >
                  Löschen
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function AssignmentForm({
  api,
  classId,
  onAdded,
}: {
  api: InteractiveApi;
  classId: string;
  onAdded: () => Promise<void>;
}) {
  const mediaApi = useMemo(() => new MediaApi(), []);
  const [recordings, setRecordings] = useState<MediaItem[]>([]);
  const [choice, setChoice] = useState('unit:1');
  const [due, setDue] = useState(() =>
    new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void mediaApi.list(classId).then((result) => {
      if (result.ok) {
        setRecordings(
          result.value.items.filter((i) => i.status === 'ready' && i.publishedAt)
        );
      }
    });
  }, [mediaApi, classId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const [kind, ref] = choice.split(':') as ['unit' | 'recording', string];
    const title =
      kind === 'unit'
        ? `Einheit ${ref}: Test bestehen`
        : `Anhören: ${recordings.find((r) => r.id === ref)?.title ?? 'Aufnahme'}`;
    const result = await api.addAssignment(classId, {
      kind,
      ref,
      title,
      dueAt: endOfDay(due),
    });
    setMessage(result.ok ? null : result.message);
    if (result.ok) await onAdded();
  };

  return (
    <form
      className="row"
      style={{ flexWrap: 'wrap' }}
      onSubmit={(e) => void submit(e)}
      aria-label="Aufgabe stellen"
    >
      <select
        className="input"
        aria-label="Aufgabe"
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        <optgroup label="Einheit (Test bestehen)">
          {Array.from({ length: 16 }, (_, i) => (
            <option key={i} value={`unit:${i + 1}`}>
              Einheit {i + 1}
            </option>
          ))}
        </optgroup>
        {recordings.length > 0 && (
          <optgroup label="Aufnahme (anhören)">
            {recordings.map((r) => (
              <option key={r.id} value={`recording:${r.id}`}>
                {r.title}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <input
        className="input"
        type="date"
        aria-label="Fällig am"
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      <button className="btn btn-primary" type="submit" disabled={!due}>
        Aufgabe stellen
      </button>
      {message && <span className="feedback-bad">{message}</span>}
    </form>
  );
}

/** Open assignments of the learner's class on "Heute". */
export function OpenAssignments({
  classId,
  items,
}: {
  classId: string;
  items: Assignment[];
}) {
  const open = items.filter((a) => !a.done);
  if (open.length === 0) return null;
  return (
    <section className="card stack" aria-labelledby="open-assignments">
      <h2 id="open-assignments" className="eyebrow">
        Aufgaben deiner Klasse
      </h2>
      <ul className="feed-list">
        {open.map((a) => (
          <li
            key={a.id}
            className="feed-item row"
            style={{ justifyContent: 'space-between' }}
          >
            <Link to={assignmentLink(classId, a)}>{a.title}</Link>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              bis {DATE.format(new Date(a.dueAt))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
