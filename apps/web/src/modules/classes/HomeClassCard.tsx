/**
 * The learner's class on "Heute" (tester feedback R6): always there, at the top. In a class:
 * open assignments, recordings not heard yet and the weekly challenge, with the next things
 * to do and the newest shout-out. Waiting for approval: says so. Without a class: how to
 * join one. Offline or without an account it shows nothing.
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '@/components/Icon';
import {
  ClassesApi,
  inviteToken,
  type ClassFeed,
  type ClassSummary,
} from '@/services/classes/classesApi';
import { InteractiveApi, type Assignment } from '@/services/media/interactiveApi';
import { MediaApi, type MediaItem } from '@/services/media/mediaApi';
import { useListenStore, useSyncStore } from '@/state';
import { assignmentLink, formatDue } from './Assignments';
import { formatDuration } from './ClassRecordings';
import { useMyClasses } from './useMyClasses';

export function HomeClassCard({ api }: { api?: ClassesApi }) {
  const client = useMemo(() => api ?? new ClassesApi(), [api]);
  const { online, classes } = useMyClasses(client);
  if (!online || !classes) return null;
  const mine = classes.filter((c) => c.classRole === 'student');
  const active = mine.find((c) => c.status === 'active');
  if (active) return <LearnerClass api={client} summary={active} />;
  const waiting = mine.find((c) => c.status === 'pending');
  if (waiting) return <WaitingClass summary={waiting} />;
  return <JoinClass />;
}

interface ClassNews {
  feed: ClassFeed | null;
  assignments: Assignment[];
  recordings: MediaItem[];
}

function LearnerClass({ api, summary }: { api: ClassesApi; summary: ClassSummary }) {
  const { t } = useTranslation('classes');
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const heard = useListenStore((s) => s.progress);
  const [news, setNews] = useState<ClassNews | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      api.feed(summary.id),
      new InteractiveApi().assignments(summary.id),
      new MediaApi().list(summary.id),
    ]).then(([feed, assignments, media]) => {
      if (!alive) return;
      setNews({
        feed: feed.ok ? feed.value : null,
        assignments: assignments.ok ? assignments.value.assignments : [],
        recordings: media.ok
          ? media.value.items.filter((i) => i.status === 'ready' && i.publishedAt)
          : [],
      });
    });
    return () => {
      alive = false;
    };
    // Refreshed after each sync: the challenge and "done" count synced progress.
  }, [api, summary.id, lastSyncAt]);

  const open = news?.assignments.filter((a) => !a.done) ?? [];
  const unheard =
    news?.recordings.filter((r) => !heard[`rec/${r.id}`]?.completedAt) ?? [];
  const challenge = news?.feed?.challenge ?? null;
  const share = challenge
    ? Math.min(
        100,
        Math.round((challenge.progress / Math.max(1, challenge.target)) * 100)
      )
    : null;
  const shout = news?.feed?.shoutouts.find((s) => s.toYou);

  return (
    <section className="card stack home-class" aria-labelledby="home-class-title">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="stack" style={{ gap: 2 }}>
          <span className="eyebrow home-class-eyebrow">{t('home.eyebrow')}</span>
          <h2 id="home-class-title" style={{ margin: 0 }}>
            {summary.name}
          </h2>
          {summary.teacherName && (
            <span className="muted" style={{ fontSize: '0.9rem' }}>
              {t('home.teacher', { teacher: summary.teacherName })}
            </span>
          )}
        </div>
        <Link
          to={`/classes/${summary.id}`}
          className="icon-button"
          aria-label={t('home.toClass', { name: summary.name })}
        >
          <Icon name="chevron" />
        </Link>
      </div>

      <ul className="home-class-tiles" aria-label={t('home.news')}>
        <li>
          <strong className="home-tile-value tone-accent">
            {news ? open.length : '…'}
          </strong>
          <span>{t('home.openTasks', { count: open.length })}</span>
        </li>
        <li>
          <strong className="home-tile-value tone-info">
            {news ? unheard.length : '…'}
          </strong>
          <span>{t('home.newRecordings', { count: unheard.length })}</span>
        </li>
        <li>
          <strong className="home-tile-value tone-good">
            {share === null ? '–' : t('percent', { value: share })}
          </strong>
          <span>{t('home.challenge')}</span>
        </li>
      </ul>

      {(open.length > 0 || unheard.length > 0) && (
        <ul className="home-class-list" aria-label={t('home.next')}>
          {open.slice(0, 3).map((a) => (
            <li key={a.id}>
              <Link to={assignmentLink(summary.id, a)} className="home-class-item">
                <Icon name="check" size={18} />
                <span className="stack" style={{ gap: 0 }}>
                  <strong>{a.title}</strong>
                  <span className="muted">
                    {t('assignments.due', { date: formatDue(a.dueAt) })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
          {unheard.slice(0, 2).map((r) => (
            <li key={r.id}>
              <Link
                to={`/classes/${summary.id}/recordings/${r.id}`}
                className="home-class-item"
              >
                <Icon name="listen" size={18} />
                <span className="stack" style={{ gap: 0 }}>
                  <strong>{r.title}</strong>
                  <span className="muted">
                    {[formatDuration(r.durationSec), t('home.notHeard')]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {news && open.length === 0 && unheard.length === 0 && (
        <p className="muted" style={{ margin: 0 }}>
          {t('home.allDone')}
        </p>
      )}
      {shout && (
        <p className="feed-item feed-item-you" style={{ margin: 0 }}>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            {t('home.shoutFrom', { author: shout.author ?? t('home.yourTeacher') })}
          </span>
          {shout.message}
        </p>
      )}
    </section>
  );
}

function WaitingClass({ summary }: { summary: ClassSummary }) {
  const { t } = useTranslation('classes');
  return (
    <section className="card stack home-class" aria-labelledby="home-class-title">
      <span className="eyebrow home-class-eyebrow">{t('home.eyebrow')}</span>
      <h2 id="home-class-title" style={{ margin: 0 }}>
        {summary.name}
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        {summary.teacherName
          ? t('home.waiting', { teacher: summary.teacherName })
          : t('home.waitingNoTeacher')}
      </p>
    </section>
  );
}

/** No class yet: paste the invite link (or its code) the teacher shared. */
function JoinClass() {
  const { t } = useTranslation('classes');
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = value.trim();
    const token =
      inviteToken(text) ?? (/^[A-Za-z0-9_-]{20,64}$/.test(text) ? text : null);
    if (!token) {
      setError(true);
      return;
    }
    navigate(`/join/${token}`);
  };

  return (
    <section
      className="card stack home-class home-class-join"
      aria-labelledby="home-class-title"
    >
      <span className="eyebrow home-class-eyebrow">{t('home.eyebrow')}</span>
      <h2 id="home-class-title" style={{ margin: 0 }}>
        {t('home.joinQuestion')}
      </h2>
      <p className="muted" style={{ margin: 0 }}>
        {t('home.joinIntro')}
      </p>
      <form className="stack" style={{ gap: '0.4rem' }} onSubmit={submit}>
        <label htmlFor="home-invite">{t('home.inviteLink')}</label>
        <div className="row" style={{ flexWrap: 'nowrap' }}>
          <input
            id="home-invite"
            className="input"
            style={{ flex: 1, minWidth: 0 }}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(false);
            }}
            placeholder={t('home.invitePlaceholder')}
            autoComplete="off"
          />
          <button type="submit" className="btn btn-primary" disabled={!value.trim()}>
            {t('home.join')}
          </button>
        </div>
        {error && <span className="feedback-bad">{t('home.notALink')}</span>}
      </form>
    </section>
  );
}
