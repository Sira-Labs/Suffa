/**
 * Classes (story 4.3): learners see their classes and whether they are approved; teachers
 * create classes. Each class has its own page (members, progress, class life).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { ClassesApi, type ClassSummary } from '@/services/classes/classesApi';
import { useSyncStore } from '@/state';
import { OFFERED_COURSES } from '@/services/courses';
import { DEFAULT_COURSE, type CourseId } from '@suffa/engagement';

export function Classes() {
  const { t } = useTranslation('classes');
  const provider = useSyncStore((s) => s.provider);
  const auth = useSyncStore((s) => s.auth);
  const api = useMemo(() => new ClassesApi(), []);
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.list();
    if (result.ok) setClasses(result.value.classes);
    else setMessage(result.message);
  }, [api]);

  useEffect(() => {
    if (auth.status === 'signed-in') void load();
  }, [auth.status, load]);

  if (!(provider instanceof ApiSyncProvider) || auth.status !== 'signed-in') {
    return (
      <div className="stack">
        <h1>{t('title')}</h1>
        <p className="muted">{t('list.signInHint')}</p>
      </div>
    );
  }
  const role = provider.currentUser()?.role;
  const canCreate = role === 'teacher' || role === 'admin';

  return (
    <div className="stack">
      <h1>{t('title')}</h1>
      {message && <span className="feedback-bad">{message}</span>}
      {canCreate && <CreateClass api={api} onCreated={load} />}
      {classes?.length === 0 && (
        <p className="muted">
          {canCreate ? t('list.emptyTeacher') : t('list.emptyLearner')}
        </p>
      )}
      {classes?.map((c) =>
        c.status === 'active' ? (
          <Link
            key={c.id}
            to={`/classes/${c.id}`}
            className="card row class-link"
            style={{ justifyContent: 'space-between' }}
          >
            <strong>{c.name}</strong>
            <span className="muted">
              {c.classRole === 'teacher'
                ? `${t('learners', { count: c.studentCount })}${c.pendingCount > 0 ? ` · ${t('waiting', { count: c.pendingCount })}` : ''}`
                : t('list.member')}
            </span>
          </Link>
        ) : (
          <div
            key={c.id}
            className="card row"
            style={{ justifyContent: 'space-between' }}
          >
            <strong>{c.name}</strong>
            <span className="muted">{t('list.awaitingApproval')}</span>
          </div>
        )
      )}
    </div>
  );
}

function CreateClass({
  api,
  onCreated,
}: {
  api: ClassesApi;
  onCreated: () => Promise<void>;
}) {
  const { t } = useTranslation('classes');
  const [name, setName] = useState('');
  const [course, setCourse] = useState<CourseId>(DEFAULT_COURSE);
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await api.create(name.trim(), course);
    if (!result.ok) return setMessage(result.message);
    setName('');
    setMessage(null);
    await onCreated();
  };
  return (
    <form className="card row" onSubmit={(e) => void submit(e)}>
      <input
        className="input"
        placeholder={t('list.newNamePlaceholder')}
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        aria-label={t('list.newName')}
        style={{ flex: 1 }}
      />
      {OFFERED_COURSES.length > 1 && (
        <select
          className="input"
          aria-label={t('list.course')}
          value={course}
          onChange={(e) => setCourse(e.target.value as CourseId)}
        >
          {OFFERED_COURSES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      )}
      <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
        {t('list.create')}
      </button>
      {message && <span className="feedback-bad">{message}</span>}
    </form>
  );
}
