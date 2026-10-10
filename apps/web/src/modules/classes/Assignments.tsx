/**
 * Class assignments (story 8.5): the teacher sets a unit (its test) or a recording (listen to
 * it) with a due date and sees how many are done; learners see what is open, what is done,
 * and where to go.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  DEFAULT_COURSE,
  courseById,
  courseOfUnit,
  type CourseId,
} from '@suffa/engagement';
import { dateLocale } from '@/i18n/format';
import { madinahLessonPath, unitLabel } from '@/services/courses';
import { InteractiveApi, type Assignment } from '@/services/media/interactiveApi';
import { MediaApi, type MediaItem } from '@/services/media/mediaApi';

/** A due date like "Mo., 5. Okt." in the interface language. */
export function formatDue(iso: string): string {
  return new Intl.DateTimeFormat(dateLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));
}

/** Where an assignment is done: a Medina lesson has its own page with the lesson test. */
export function assignmentLink(
  classId: string,
  a: Pick<Assignment, 'kind' | 'ref'>
): string {
  if (a.kind === 'recording') return `/classes/${classId}/recordings/${a.ref}`;
  const unit = Number(a.ref);
  return courseOfUnit(unit)?.id === 'madinah'
    ? madinahLessonPath(unit)
    : `/units/${unit}`;
}

/** End of the chosen local day, as an ISO instant. */
export function endOfDay(date: string): string {
  const d = new Date(`${date}T23:59:00`);
  return d.toISOString();
}

export function Assignments({
  classId,
  teacher,
  course = DEFAULT_COURSE,
}: {
  classId: string;
  teacher: boolean;
  course?: CourseId;
}) {
  const { t } = useTranslation('classes');
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
        {t('assignments.title')}
      </h2>
      {teacher && (
        // Keyed: another class or course starts the form fresh, with a unit of that course.
        <AssignmentForm
          key={`${classId}:${course}`}
          api={api}
          classId={classId}
          course={course}
          onAdded={load}
        />
      )}
      {message && <span className="feedback-bad">{message}</span>}
      {items?.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {teacher ? t('assignments.noneTeacher') : t('assignments.noneLearner')}
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
                  {t('assignments.due', { date: formatDue(a.dueAt) })}
                  {teacher &&
                    t('assignments.doneCount', { done: a.doneCount, total: a.learners })}
                </span>
              </span>
              {teacher && (
                <button
                  className="btn btn-small"
                  onClick={() => void api.removeAssignment(classId, a.id).then(load)}
                >
                  {t('delete')}
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
  course,
  onAdded,
}: {
  api: InteractiveApi;
  classId: string;
  course: CourseId;
  onAdded: () => Promise<void>;
}) {
  const { t } = useTranslation('classes');
  // Units can only be assigned where a unit test exists (our own exercises, ADR-0025).
  const { units, exercises } = courseById(course);
  const mediaApi = useMemo(() => new MediaApi(), []);
  const [recordings, setRecordings] = useState<MediaItem[]>([]);
  const [choice, setChoice] = useState(exercises ? `unit:${units[0]}` : '');
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

  // Without unit tests the first recording is the default choice.
  useEffect(() => {
    if (!choice && recordings[0]) setChoice(`recording:${recordings[0].id}`);
  }, [choice, recordings]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!choice) return;
    const [kind, ref] = choice.split(':') as ['unit' | 'recording', string];
    // The title is stored with the assignment, in the teacher's interface language.
    const title =
      kind === 'unit'
        ? t('assignments.unitTitle', { unit: unitLabel(Number(ref)) })
        : t('assignments.recordingTitle', {
            title:
              recordings.find((r) => r.id === ref)?.title ??
              t('assignments.recordingFallback'),
          });
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
      aria-label={t('assignments.form')}
    >
      <select
        className="input"
        aria-label={t('assignments.choice')}
        value={choice}
        onChange={(e) => setChoice(e.target.value)}
      >
        {!choice && <option value="">{t('assignments.nothing')}</option>}
        {exercises && (
          <optgroup
            label={
              course === 'madinah'
                ? t('assignments.lessonGroup')
                : t('assignments.unitGroup')
            }
          >
            {units.map((u) => (
              <option key={u} value={`unit:${u}`}>
                {unitLabel(u)}
              </option>
            ))}
          </optgroup>
        )}
        {recordings.length > 0 && (
          <optgroup label={t('assignments.recordingGroup')}>
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
        aria-label={t('assignments.dueLabel')}
        value={due}
        onChange={(e) => setDue(e.target.value)}
      />
      <button className="btn btn-primary" type="submit" disabled={!due || !choice}>
        {t('assignments.submit')}
      </button>
      {!exercises && (
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {t('assignments.noTests', { course: courseById(course).name })}
        </span>
      )}
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
  const { t } = useTranslation('classes');
  const open = items.filter((a) => !a.done);
  if (open.length === 0) return null;
  return (
    <section className="card stack" aria-labelledby="open-assignments">
      <h2 id="open-assignments" className="eyebrow">
        {t('assignments.openTitle')}
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
              {t('assignments.due', { date: formatDue(a.dueAt) })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
