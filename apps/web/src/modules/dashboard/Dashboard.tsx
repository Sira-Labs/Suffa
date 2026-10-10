import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { content } from '@/content';
import { ArabicText, MeaningText } from '@/components';
import { meaningOf, useMeaningLanguage } from '@/services/meanings';
import { Icon } from '@/components/Icon';
import { isTtsSupported, speakArabic } from '@/services/speech';
import { weakCards } from '@/services/stats';
import { localDay, wordOfTheDay } from '@/services/today';
import { XP_RULES } from '@/services/engagement/xp';
import { madinahProgress, useActiveCourse } from '@/services/courses';
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
import { dateLocale } from '@/i18n/format';

const today = () =>
  new Intl.DateTimeFormat(dateLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

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
  const { t } = useTranslation('dashboard');
  const cards = useSrsStore((s) => s.cards);
  const summary = useSrsStore((s) => s.summary)();
  const logs = useEngagementStore((s) => s.logs);
  const refreshLogs = useEngagementStore((s) => s.refresh);
  const enrollments = useEnrollmentStore((s) => s.enrollments);
  const exams = useEnrollmentStore((s) => s.exams);
  const activeUnit = currentUnit(enrollments, exams);
  // Quests lead into the learner's course: the next Medina lesson, or the current unit.
  const course = useActiveCourse();
  const questUnit = course === 'madinah' ? nextMadinahUnit(exams) : (activeUnit ?? 1);
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
  const meaningLanguage = useMeaningLanguage();
  const checkedIn = Boolean(checkIns[todayKey]);
  const onCheckIn = () => {
    if (!word) return;
    void checkIn(word.id).then(({ first, xp }) => {
      if (first) celebrate({ title: t('home.checkInTitle'), xp, big: false });
    });
  };

  return (
    <div className="stack" style={{ gap: '1.5rem' }}>
      <header
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}
      >
        <div className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">{today()}</span>
          <h1>{t('home.greeting')}</h1>
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <span className="badge header-chip">
            <strong style={{ color: 'var(--accent)' }}>
              {t('home.weekXp', { xp: weekXp })}
            </strong>
            <span>{t('home.thisWeek')}</span>
          </span>
          <span className="badge header-chip">
            <span style={{ color: 'var(--accent)', display: 'inline-flex' }}>
              <Icon name="flame" size={16} />
            </span>
            {streak === 0 ? (
              t('home.startToday')
            ) : (
              <>
                {t('home.streakDays', { count: streak })}
                <span className="visually-hidden">{t('home.inARow')}</span>
              </>
            )}
          </span>
        </div>
      </header>

      <HomeClassCard />
      <CurrentUnitCard />

      <div className="today-grid">
        <TodayQuests summary={engagement} unit={questUnit} />

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
                {t('home.wordOfTheDay')}
              </h2>
              {isTtsSupported() && (
                <button
                  type="button"
                  className="icon-button icon-button-paper"
                  onClick={() => speakArabic(word.ar)}
                  aria-label={t('home.listenTo', {
                    word: meaningOf(word, meaningLanguage).text,
                  })}
                >
                  <Icon name="volume" size={20} />
                </button>
              )}
            </div>
            <ArabicText size="hero" style={{ textAlign: 'right' }}>
              {word.ar}
            </ArabicText>
            <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>
              <MeaningText meaning={meaningOf(word, meaningLanguage)} />
            </p>
            <p className="muted" style={{ margin: 0 }}>
              {t('home.root')} <span className="arabic-inline">{word.wurzel}</span>
              {word.plural ? (
                <>
                  {` · ${t('home.plural')} `}
                  <span className="arabic-inline">{word.plural}</span>
                </>
              ) : null}
            </p>
            {checkedIn ? (
              <p className="word-checkin-done" style={{ margin: 0 }}>
                <Icon name="check" size={16} strokeWidth={2.6} /> {t('home.checkedIn')}
              </p>
            ) : (
              <button type="button" className="btn btn-primary" onClick={onCheckIn}>
                {t('home.checkIn', { xp: XP_RULES.dailyCheckIn })}
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
          <strong>{t('home.yourProgress')}</strong>
          <span className="muted stat-tile-hint">
            {t('home.progressLine', {
              level: engagement.level.level,
              due: summary.dueCount,
            })}{' '}
            {t('home.weakWords', { count: weak.length })}
          </span>
        </span>
        <Icon name="chevron" />
      </Link>
    </div>
  );
}

/** The Medina lesson to practise: the first not passed yet, else the last one. */
function nextMadinahUnit(exams: Parameters<typeof madinahProgress>[0]): number {
  const { next, lessons } = madinahProgress(exams);
  return (next ?? lessons[lessons.length - 1])?.lesson.unit ?? 101;
}
