/**
 * "Heute" for teachers (tester feedback R6): their classes first, each with how many learners
 * were active this week, how far the newest assignment is and who heard the newest
 * recording; a hint when someone waits for approval; the teacher's own learning below.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import { ClassesApi, type ClassSummary } from '@/services/classes/classesApi';
import { InteractiveApi, type Assignment } from '@/services/media/interactiveApi';
import { MediaApi, type RecordingListening } from '@/services/media/mediaApi';
import { useMyClasses } from './useMyClasses';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function TeacherHome({ api }: { api?: ClassesApi }) {
  const client = useMemo(() => api ?? new ClassesApi(), [api]);
  const { online, classes } = useMyClasses(client);
  const mine = (classes ?? []).filter(
    (c) => c.classRole === 'teacher' && c.status === 'active'
  );
  const waiting = mine.filter((c) => c.pendingCount > 0);
  const waitingCount = waiting.reduce((n, c) => n + c.pendingCount, 0);

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <header className="row" style={{ justifyContent: 'space-between' }}>
        <h1 style={{ margin: 0 }}>Deine Klassen</h1>
        <Link to="/classes" className="btn">
          + Neue Klasse
        </Link>
      </header>

      {!online && (
        <p className="muted" style={{ margin: 0 }}>
          Ohne Verbindung zum Server sind die Klassen gerade nicht zu sehen.
        </p>
      )}
      {waitingCount > 0 && (
        <Link to={`/classes/${waiting[0]!.id}?tab=members`} className="home-waiting">
          <strong>
            {waitingCount === 1
              ? '1 Person wartet auf Freigabe'
              : `${waitingCount} Personen warten auf Freigabe`}
          </strong>
          <span>Ansehen</span>
        </Link>
      )}
      {classes && mine.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          Noch keine Klasse. Lege eine an und teile den Einladungslink mit deinen
          Lernenden.
        </p>
      )}
      {mine.map((c) => (
        <TeacherClassCard key={c.id} api={client} summary={c} />
      ))}

      <Link to="/units" className="card row home-link-row">
        <span className="stack" style={{ gap: 0 }}>
          <strong>Selbst lernen</strong>
          <span className="muted stat-tile-hint">Deine Einheit fortsetzen und üben</span>
        </span>
        <Icon name="chevron" />
      </Link>
    </div>
  );
}

interface Stats {
  activeWeek: number | null;
  assignment: Assignment | null;
  recording: RecordingListening | null;
}

function TeacherClassCard({ api, summary }: { api: ClassesApi; summary: ClassSummary }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      api.progress(summary.id),
      new InteractiveApi().assignments(summary.id),
      new MediaApi().listening(summary.id),
    ]).then(([progress, assignments, listening]) => {
      if (!alive) return;
      const since = Date.now() - WEEK_MS;
      setStats({
        activeWeek: progress.ok
          ? progress.value.students.filter(
              (s) => s.lastActiveAt && Date.parse(s.lastActiveAt) >= since
            ).length
          : null,
        // The assignment due next; else the one that ended last.
        assignment: assignments.ok ? pickAssignment(assignments.value.assignments) : null,
        recording: listening.ok ? (listening.value.recordings[0] ?? null) : null,
      });
    });
    return () => {
      alive = false;
    };
  }, [api, summary.id]);

  const learners = summary.studentCount;
  const recording = stats?.recording ?? null;
  const assignment = stats?.assignment ?? null;
  return (
    <section className="card stack home-class" aria-labelledby={`class-${summary.id}`}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ gap: 2 }}>
          <h2 id={`class-${summary.id}`} style={{ margin: 0 }}>
            <Link to={`/classes/${summary.id}`} className="home-class-name">
              {summary.name}
            </Link>
          </h2>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {learners === 1 ? '1 Lernende·r' : `${learners} Lernende`}
            {summary.pendingCount > 0 && ` · ${summary.pendingCount} warten`}
          </span>
        </div>
        <Icon name="people" />
      </div>
      <ul className="home-class-tiles" aria-label={`Diese Woche in ${summary.name}`}>
        <li>
          <strong className="home-tile-value tone-good">
            {stats?.activeWeek == null ? '–' : `${stats.activeWeek}/${learners}`}
          </strong>
          <span>aktiv diese Woche</span>
        </li>
        <li>
          <strong className="home-tile-value tone-accent">
            {assignment?.doneCount == null
              ? '–'
              : `${assignment.doneCount}/${assignment.learners ?? learners}`}
          </strong>
          <span>{assignment ? 'Aufgabe erledigt' : 'keine Aufgabe offen'}</span>
        </li>
        <li>
          <strong className="home-tile-value tone-info">
            {recording ? `${recording.finished}/${recording.learners}` : '–'}
          </strong>
          <span>{recording ? 'letzte Aufnahme gehört' : 'noch keine Aufnahme'}</span>
        </li>
      </ul>
      {recording && recording.learners > 0 && (
        <div className="stack" style={{ gap: '0.3rem' }}>
          <span style={{ fontWeight: 600 }}>{recording.title}</span>
          <div
            className="review-progress"
            role="progressbar"
            aria-label={`${recording.title}: gehört`}
            aria-valuemin={0}
            aria-valuemax={recording.learners}
            aria-valuenow={recording.finished}
          >
            <div
              style={{ width: `${(recording.finished / recording.learners) * 100}%` }}
            />
          </div>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {recording.finished} von {recording.learners} gehört · {recording.started}{' '}
            angefangen
          </span>
        </div>
      )}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <Link to={`/classes/${summary.id}?tab=recordings`} className="btn">
          Aufnahme hochladen
        </Link>
        <Link to={`/classes/${summary.id}/quiz`} className="btn">
          Live-Quiz starten
        </Link>
      </div>
    </section>
  );
}

/** The open assignment due next; with none open, the one that ended last. */
export function pickAssignment(items: Assignment[], now = Date.now()): Assignment | null {
  const byDue = [...items].sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
  return byDue.find((a) => Date.parse(a.dueAt) >= now) ?? byDue[byDue.length - 1] ?? null;
}
