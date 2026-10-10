/**
 * Class dashboard (story 6.1): who learned in the last 7 days, quests and XP, how firmly the
 * class knows each unit, and the words most learners struggle with. Teachers only; the
 * server sends aggregates, never raw records.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { content } from '@/content';
import i18n from '@/i18n';
import { classMasteryByUnit, isInactive, leechWords } from '@/services/classes/dashboard';
import type { ClassesApi, ClassProgress } from '@/services/classes/classesApi';

/** "heute", "gestern", "vor 5 Tagen", or "noch nie", in the interface language. */
function lastActiveLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return i18n.t('classes:progress.never');
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(now) - day(new Date(iso))) / 86_400_000);
  if (days <= 0) return i18n.t('classes:progress.today');
  if (days === 1) return i18n.t('classes:progress.yesterday');
  return i18n.t('classes:progress.daysAgo', { count: days });
}

export function ClassProgressView({
  api,
  classId,
}: {
  api: ClassesApi;
  classId: string;
}) {
  const { t } = useTranslation('classes');
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
  if (!data) return <p className="muted">{t('progress.loading')}</p>;
  if (data.students.length === 0) {
    return <p className="muted">{t('progress.empty')}</p>;
  }
  const active = data.students.filter((s) => !isInactive(s.lastActiveAt)).length;

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <p className="muted" style={{ margin: 0 }}>
        {t('progress.active', { active, total: data.students.length })}
      </p>
      <div className="card table-scroll">
        <table className="data-table">
          <caption className="visually-hidden">{t('progress.caption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('progress.columns.name')}</th>
              <th scope="col">{t('progress.columns.lastActive')}</th>
              <th scope="col">{t('progress.columns.activeDays')}</th>
              <th scope="col">{t('progress.columns.quests')}</th>
              <th scope="col">{t('progress.columns.xp')}</th>
              <th scope="col">{t('progress.columns.streak')}</th>
              <th scope="col">{t('progress.columns.mature')}</th>
              <th scope="col">{t('progress.columns.unit')}</th>
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
          {t('progress.masteryTitle')}
        </h2>
        <ul className="mastery-bars">
          {mastery.map(([unit, percent]) => (
            <li key={unit}>
              <span>{t('progress.unit', { unit })}</span>
              <span
                className="review-progress"
                role="progressbar"
                aria-label={t('progress.unit', { unit })}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
              >
                <span
                  style={{ display: 'block', height: '100%', width: `${percent}%` }}
                />
              </span>
              <span className="muted">{t('percent', { value: percent })}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card stack" aria-labelledby="class-leeches">
        <h2 id="class-leeches" className="eyebrow">
          {t('progress.leechesTitle')}
        </h2>
        {leeches.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t('progress.noLeeches')}
          </p>
        ) : (
          <ul className="weak-words-list">
            {leeches.map((w) => (
              <li key={w.id}>
                <span lang="ar" dir="rtl" className="arabic-inline">
                  {w.ar}
                </span>
                <span className="muted">
                  {t('progress.leech', {
                    meaning: w.de,
                    unit: w.einheit,
                    count: w.learners,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
