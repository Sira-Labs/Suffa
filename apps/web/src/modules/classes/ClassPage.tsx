/**
 * One class (Sprint 6). Teachers: progress (6.1), class life (6.2) and members (4.3) as tabs.
 * Learners: the class feed with the weekly challenge, shout-outs and badges.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ClassesApi, type ClassSummary } from '@/services/classes/classesApi';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { useSyncStore } from '@/state';
import { ClassCertificates } from './ClassCertificates';
import { ClassLife } from './ClassLife';
import { ClassMembers } from './ClassMembers';
import { ClassGrades } from './ClassGrades';
import { ClassRecordings } from './ClassRecordings';
import { ClassProgressView } from './ClassProgressView';
import { SpeechSettingCard } from './SpeechSettingCard';
import { SpeechApi } from '@/services/speech';
import { courseById, type CourseId } from '@suffa/engagement';
import { useActiveCourse, useSetCourse } from '@/services/courses';

type Tab = 'progress' | 'life' | 'recordings' | 'grades' | 'certificates' | 'members';
const TABS: { id: Tab; label: string }[] = [
  { id: 'progress', label: 'Fortschritt' },
  { id: 'life', label: 'Klassenleben' },
  { id: 'recordings', label: 'Aufnahmen' },
  { id: 'grades', label: 'Bewertungen' },
  { id: 'certificates', label: 'Zertifikate' },
  { id: 'members', label: 'Mitglieder' },
];

export function ClassPage() {
  const { id = '' } = useParams();
  const provider = useSyncStore((s) => s.provider);
  const auth = useSyncStore((s) => s.auth);
  const api = useMemo(() => new ClassesApi(), []);
  const speechApi = useMemo(() => new SpeechApi(), []);
  const [summary, setSummary] = useState<ClassSummary | null | undefined>(undefined);
  // Links from "Heute" open a tab directly (?tab=recordings).
  const [params] = useSearchParams();
  const asked = params.get('tab');
  const [tab, setTab] = useState<Tab>(TABS.find((t) => t.id === asked)?.id ?? 'progress');

  const load = useCallback(async () => {
    const result = await api.list();
    setSummary(
      result.ok ? (result.value.classes.find((c) => c.id === id) ?? null) : null
    );
  }, [api, id]);

  useEffect(() => {
    if (auth.status === 'signed-in') void load();
  }, [auth.status, load]);

  if (!(provider instanceof ApiSyncProvider) || auth.status !== 'signed-in') {
    return <p className="muted">Bitte melde dich unter Einstellungen an.</p>;
  }
  if (summary === undefined) return <p className="muted">Lade Klasse …</p>;
  if (summary === null || summary.status !== 'active') {
    return (
      <div className="stack">
        <p className="muted">
          Diese Klasse gibt es nicht oder du bist (noch) nicht freigegeben.
        </p>
        <Link to="/classes">Zu deinen Klassen</Link>
      </div>
    );
  }
  const teacher = summary.classRole === 'teacher';

  return (
    <div className="stack" style={{ gap: '1.25rem' }}>
      <header className="stack" style={{ gap: '0.25rem' }}>
        <Link to="/classes" className="muted">
          ← Klassen
        </Link>
        <h1>{summary.name}</h1>
        {!teacher && <ClassCourseHint course={summary.course} />}
      </header>
      {teacher ? (
        <>
          <div className="tab-list" role="tablist" aria-label="Bereiche der Klasse">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                className="tab"
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
            {tab === 'progress' && <ClassProgressView api={api} classId={summary.id} />}
            {tab === 'life' && (
              <ClassLife api={api} classId={summary.id} teacher course={summary.course} />
            )}
            {tab === 'recordings' && <ClassRecordings classId={summary.id} teacher />}
            {tab === 'grades' && <ClassGrades classId={summary.id} />}
            {tab === 'certificates' && (
              <ClassCertificates api={api} classId={summary.id} />
            )}
            {tab === 'members' && (
              <div className="stack" style={{ gap: '1rem' }}>
                <ClassMembers api={api} summary={summary} onChange={load} />
                <SpeechSettingCard api={speechApi} classId={summary.id} />
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <ClassLife
            api={api}
            classId={summary.id}
            teacher={false}
            course={summary.course}
          />
          <section className="stack" aria-labelledby="recordings-title">
            <h2 id="recordings-title" className="eyebrow">
              Aufnahmen
            </h2>
            <ClassRecordings classId={summary.id} teacher={false} />
          </section>
        </>
      )}
    </div>
  );
}

/** A learner whose own course differs from the class's is offered to follow the class. */
function ClassCourseHint({ course }: { course?: CourseId }) {
  const active = useActiveCourse();
  const setCourse = useSetCourse();
  if (!course || course === active) return null;
  return (
    <p className="card row" style={{ flexWrap: 'wrap', gap: '0.5rem', margin: 0 }}>
      <span>Diese Klasse lernt mit dem {courseById(course).name}.</span>
      <button
        className="btn btn-small btn-primary"
        onClick={() => void setCourse(course)}
      >
        Zum {courseById(course).name} wechseln
      </button>
    </p>
  );
}
