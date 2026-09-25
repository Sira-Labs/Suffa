/**
 * Class dashboard (story 6.1): who learned in the last 7 days, quests and XP, how firmly the
 * class knows each unit, and the words most learners struggle with. Teachers only; the
 * server sends aggregates, never raw records.
 */
import { useEffect, useMemo, useState } from 'react';
import { content } from '@/content';
import {
  classMasteryByUnit,
  isInactive,
  lastActiveLabel,
  leechWords,
} from '@/services/classes/dashboard';
import type { ClassesApi, ClassProgress } from '@/services/classes/classesApi';

export function ClassProgressView({
  api,
  classId,
}: {
  api: ClassesApi;
  classId: string;
}) {
  const [data, setData] = useState<ClassProgress | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.progress(classId).then((result) => {
      if (cancelled) return;
      if (result.ok) setData(result.value);
      else setMessage(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [api, classId]);

  const mastery = useMemo(
    () =>
      data
        ? [
            ...classMasteryByUnit(
              data.matureByRef,
              data.students.length,
              content.vokabeln
            ),
          ].sort(([a], [b]) => a - b)
        : [],
    [data]
  );
  const leeches = useMemo(
    () => (data ? leechWords(data.leeches, content.vokabeln) : []),
    [data]
  );

  if (message) return <p className="feedback-bad">{message}</p>;
  if (!data) return <p className="muted">Lade Fortschritt …</p>;
  if (data.students.length === 0) {
    return (
      <p className="muted">
        Noch keine freigegebenen Lernenden. Teile den Einladungslink unter „Mitglieder“.
      </p>
    );
  }
  const active = data.students.filter((s) => !isInactive(s.lastActiveAt)).length;

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <p className="muted" style={{ margin: 0 }}>
        {active} von {data.students.length} Lernenden waren in den letzten 3 Tagen aktiv.
        Zahlen der letzten 7 Tage, Stand der letzten Synchronisierung.
      </p>
      <div className="card table-scroll">
        <table className="data-table">
          <caption className="visually-hidden">Lernende der Klasse</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Zuletzt aktiv</th>
              <th scope="col">Lerntage</th>
              <th scope="col">Aufgaben</th>
              <th scope="col">XP (7 Tage)</th>
              <th scope="col">Serie</th>
              <th scope="col">Gefestigte Wörter</th>
              <th scope="col">Einheit</th>
            </tr>
          </thead>
          <tbody>
            {data.students.map((s) => (
              <tr
                key={s.userId}
                className={isInactive(s.lastActiveAt) ? 'row-inactive' : ''}
              >
                <th scope="row">{s.name ?? s.email}</th>
                <td>{lastActiveLabel(s.lastActiveAt)}</td>
                <td>{s.activeDaysWeek}/7</td>
                <td>{s.questsWeek}</td>
                <td>{s.xpWeek}</td>
                <td>{s.streak}</td>
                <td>{s.matureWords}</td>
                <td>{s.currentUnit ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="card stack" aria-labelledby="class-mastery">
        <h2 id="class-mastery" className="eyebrow">
          Gefestigt pro Einheit (ganze Klasse)
        </h2>
        <ul className="mastery-bars">
          {mastery.map(([unit, percent]) => (
            <li key={unit}>
              <span>Einheit {unit}</span>
              <span
                className="review-progress"
                role="progressbar"
                aria-label={`Einheit ${unit}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <span
                  style={{ display: 'block', height: '100%', width: `${percent}%` }}
                />
              </span>
              <span className="muted">{percent} %</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack" aria-labelledby="class-leeches">
        <h2 id="class-leeches" className="eyebrow">
          Schwierige Wörter
        </h2>
        {leeches.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Gerade keine Wörter, an denen mehrere hängen bleiben.
          </p>
        ) : (
          <ul className="weak-words-list">
            {leeches.map((w) => (
              <li key={w.id}>
                <span lang="ar" dir="rtl" className="arabic-inline">
                  {w.ar}
                </span>
                <span className="muted">
                  {w.de} · Einheit {w.einheit} · {w.learners}{' '}
                  {w.learners === 1 ? 'Lernende:r' : 'Lernende'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
