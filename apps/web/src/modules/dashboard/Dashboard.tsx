import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { content } from '@/content';
import { ArabicText } from '@/components';
import { Icon } from '@/components/Icon';
import { isTtsSupported, speakArabic } from '@/services/speech';
import { weakCards } from '@/services/stats';
import { localDay, wordOfTheDay } from '@/services/today';
import { XP_RULES } from '@/services/engagement/xp';
import { ForgettingReminder } from './ForgettingReminder';
import {
  useCelebrationStore,
  useCheckInStore,
  useEngagementStore,
  useEnrollmentStore,
  useSrsStore,
} from '@/state';
import { CurrentUnitCard, currentUnit } from './CurrentUnitCard';
import { useReachedUnits } from '@/modules/units/useReachedUnits';
import { TodayQuests } from '@/modules/engagement/TodayQuests';
import { HomeBadges } from '@/modules/engagement/HomeBadges';
import { HomeClassCard } from '@/modules/classes/HomeClassCard';
import { TeacherHome } from '@/modules/classes/TeacherHome';
import { useRole } from '@/modules/account/useRole';
import { WeeklyRecapCard } from './WeeklyRecapCard';
import { useEngagement } from '@/modules/engagement/useEngagement';

const DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** "Heute": teachers see their classes first, learners their own day. */
export function Dashboard() {
  const role = useRole();
  return role === 'teacher' ? <TeacherHome /> : <LearnerHome />;
}

/**
 * The learner's day (redesign after tester feedback R6): their class always at the top, then
 * the unit to continue, today's quests and the word of the day; statistics live on
 * "Fortschritt", one row away.
 */
function LearnerHome() {
  const cards = useSrsStore((s) => s.cards);
  const summary = useSrsStore((s) => s.summary)();
  const logs = useEngagementStore((s) => s.logs);
  const refreshLogs = useEngagementStore((s) => s.refresh);
  const enrollments = useEnrollmentStore((s) => s.enrollments);
  const exams = useEnrollmentStore((s) => s.exams);
  const activeUnit = currentUnit(enrollments, exams);
  const checkIns = useCheckInStore((s) => s.checkIns);
  const checkIn = useCheckInStore((s) => s.checkIn);
  const celebrate = useCelebrationStore((s) => s.show);
  const { keep } = useReachedUnits();

  const engagement = useEngagement();

  useEffect(() => {
    void refreshLogs();
  }, [cards, refreshLogs]);
  const weak = weakCards(cards, logs);
  const streak = engagement.streak.current;
  const todayKey = localDay(new Date());
  const { weekXp } = engagement;
  // The word of the day comes from the units reached so far.
  const word = wordOfTheDay(content.vokabeln.filter(keep));
  const checkedIn = Boolean(checkIns[todayKey]);
  const onCheckIn = () => {
    if (!word) return;
    void checkIn(word.id).then(({ first, xp }) => {
      if (first) celebrate({ title: 'Tages-Check-in', xp, big: false });
    });
  };

  return (
    <div className="stack" style={{ gap: '1.5rem' }}>
      <header
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}
      >
        <div className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">{DATE_FORMAT.format(new Date())}</span>
          <h1>Ahlan wa sahlan</h1>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <span className="badge header-chip">
            <strong style={{ color: 'var(--accent)' }}>{weekXp} XP</strong>
            <span>diese Woche</span>
          </span>
          <span className="badge header-chip">
            <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
              <Icon name="flame" size={16} />
            </span>
            {streak === 0 ? (
              'Heute starten'
            ) : (
              <>
                {streak === 1 ? '1 Tag' : `${streak} Tage`}
                <span className="visually-hidden"> in Folge gelernt</span>
              </>
            )}
          </span>
        </div>
      </header>

      <HomeClassCard />
      <CurrentUnitCard />

      <div className="today-grid">
        <TodayQuests summary={engagement} unit={activeUnit ?? 1} />

        {word && (
          <section
            className="paper stack"
            aria-labelledby="word-of-day"
            style={{ gap: '0.5rem' }}
          >
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2
                id="word-of-day"
                className="eyebrow"
                style={{ color: 'var(--on-paper-muted)' }}
              >
                Wort des Tages
              </h2>
              {isTtsSupported() && (
                <button
                  type="button"
                  className="icon-button icon-button-paper"
                  onClick={() => speakArabic(word.ar)}
                  aria-label={`${word.de} anhören`}
                >
                  <Icon name="volume" size={20} />
                </button>
              )}
            </div>
            <ArabicText size="hero" style={{ textAlign: 'right' }}>
              {word.ar}
            </ArabicText>
            <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{word.de}</p>
            <p className="muted" style={{ margin: 0 }}>
              Wurzel <span className="arabic-inline">{word.wurzel}</span>
              {word.plural ? (
                <>
                  {' · Plural '}
                  <span className="arabic-inline">{word.plural}</span>
                </>
              ) : null}
            </p>
            {checkedIn ? (
              <p className="word-checkin-done" style={{ margin: 0 }}>
                <Icon name="check" size={16} strokeWidth={2.6} /> Heute eingecheckt
              </p>
            ) : (
              <button type="button" className="btn btn-primary" onClick={onCheckIn}>
                {`Wort gelernt · Check-in +${XP_RULES.dailyCheckIn} XP`}
              </button>
            )}
          </section>
        )}
      </div>

      <HomeBadges badges={engagement.badges} />
      <WeeklyRecapCard />
      <ForgettingReminder cards={cards} logs={logs} />

      <Link to="/progress" className="card row home-link-row">
        <span className="stack" style={{ gap: 0 }}>
          <strong>Dein Fortschritt</strong>
          <span className="muted stat-tile-hint">
            Level {engagement.level.level} · {summary.dueCount} fällig ·{' '}
            {weak.length === 1 ? '1 wackeliges Wort' : `${weak.length} wackelige Wörter`}
          </span>
        </span>
        <Icon name="chevron" />
      </Link>
    </div>
  );
}
