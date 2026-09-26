import { useEffect, useMemo } from 'react';
import { dayKey } from '@suffa/engagement';
import { Link } from 'react-router-dom';
import type { SrsCard } from '@/types';
import { content } from '@/content';
import { ArabicText } from '@/components';
import { Icon } from '@/components/Icon';
import { isTtsSupported, speakArabic } from '@/services/speech';
import { masteryBuckets, weakCards } from '@/services/stats';
import { activityHeatmap, activityLabel } from '@/services/activity';
import { localDay, wordOfTheDay } from '@/services/today';
import { XP_RULES } from '@/services/engagement/xp';
import { ForgettingReminder } from './ForgettingReminder';
import {
  useCelebrationStore,
  useCheckInStore,
  useContentStore,
  useEngagementStore,
  useEnrollmentStore,
  useListenStore,
  usePracticeStore,
  useSrsStore,
} from '@/state';
import { CurrentUnitCard, currentUnit } from './CurrentUnitCard';
import { LevelCard } from './LevelCard';
import { useReachedUnits } from '@/modules/units/useReachedUnits';
import { TodayQuests } from '@/modules/engagement/TodayQuests';
import { TodayClassCard } from '@/modules/classes/TodayClassCard';
import { WeeklyRecapCard } from './WeeklyRecapCard';
import { useEngagement, useLearnerTimeZone } from '@/modules/engagement/useEngagement';

const DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * "Heute": the current unit, today's quests with one clear next step, the word of the day,
 * then class news and progress.
 */
export function Dashboard() {
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
  const mastery = masteryBuckets(cards);
  const weak = weakCards(cards, logs);
  const streak = engagement.streak.current;
  // Every kind of learning counts, on the learner's own days (like the streak).
  const listened = useListenStore((s) => s.progress);
  const practised = usePracticeStore((s) => s.records);
  const timeZone = useLearnerTimeZone();
  // The learner's day now: a render after midnight moves the 28-day window on.
  const learnerDay = dayKey(new Date(), timeZone);
  const heat = useMemo(
    () =>
      activityHeatmap(
        {
          reviews: logs,
          tracks: Object.values(listened),
          practice: Object.values(practised),
        },
        timeZone
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- learnerDay only invalidates
    [logs, listened, practised, timeZone, learnerDay]
  );
  const maxHeat = Math.max(1, ...heat.map((h) => h.total));
  const todayKey = localDay(new Date());
  const { weekXp, totalXp } = engagement;
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

      <TodayClassCard />
      <WeeklyRecapCard />
      <ForgettingReminder cards={cards} logs={logs} />

      <section className="stack" aria-labelledby="progress" style={{ gap: '1rem' }}>
        <h2 id="progress" className="eyebrow">
          Fortschritt
        </h2>
        <LevelCard totalXp={totalXp} level={engagement.level} />
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}
        >
          <Stat
            label="Fällig heute"
            hint="heute zu wiederholen"
            value={summary.dueCount}
            accent="var(--info)"
          />
          <Stat
            label="Neu verfügbar"
            hint="aus deinen Einheiten"
            value={summary.newCount}
            accent="var(--accent)"
          />
          <Stat
            label="Lernend"
            hint="gesehen, noch unter 3 Wochen"
            value={mastery.lernend}
            accent="var(--text)"
          />
          <Stat
            label="Sicher"
            hint="3 Wochen und länger gemerkt"
            value={mastery.reif}
            accent="var(--good)"
          />
        </div>
        <WeakWords cards={weak} />

        <div className="card stack">
          <strong>Aktivität (letzte 28 Tage)</strong>
          <div className="row" style={{ gap: 4 }} aria-label="Lern-Aktivität je Tag">
            {heat.map((cell) => {
              const intensity = cell.total / maxHeat;
              return (
                <span
                  key={cell.date}
                  title={activityLabel(cell)}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    background:
                      cell.total === 0
                        ? 'var(--bg-elev-2)'
                        : `color-mix(in srgb, var(--accent) ${20 + intensity * 80}%, transparent)`,
                  }}
                />
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  hint,
  value,
  accent,
}: {
  label: string;
  hint: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="card stat-tile">
      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: accent }}>{value}</div>
      <div style={{ fontWeight: 600 }}>{label}</div>
      <div className="muted stat-tile-hint">{hint}</div>
    </div>
  );
}

/**
 * Wobbly words: last answered "Schwer" or "Nochmal" (or forgotten again and again). They come
 * back sooner (short intervals); the list shows which ones they are.
 */
function WeakWords({ cards }: { cards: SrsCard[] }) {
  const userVocab = useContentStore((s) => s.userVocab);
  const words = useMemo(() => {
    const byId = new Map<string, { ar: string; de: string }>(
      [...content.vokabeln, ...userVocab].map((v) => [v.id, v])
    );
    const seen = new Set<string>();
    return cards.flatMap((c) => {
      const word = byId.get(c.contentRef);
      if (!word || seen.has(c.contentRef)) return [];
      seen.add(c.contentRef);
      return [{ id: c.contentRef, ...word }];
    });
  }, [cards, userVocab]);

  return (
    <details className="card weak-words">
      <summary>
        <span className="weak-words-count">{words.length}</span>
        <span className="stack" style={{ gap: 0 }}>
          <strong>Wackelige Wörter</strong>
          <span className="muted stat-tile-hint">
            zuletzt „Schwer“ oder „Nochmal“ – kommen schneller wieder dran
          </span>
        </span>
      </summary>
      {words.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Gerade keine. Sobald du ein Wort mit „Schwer“ oder „Nochmal“ bewertest, steht es
          hier.
        </p>
      ) : (
        <>
          <Link to="/review?focus=weak" className="btn btn-primary weak-words-cta">
            Jetzt gezielt üben
          </Link>
          <ul className="weak-words-list">
            {words.map((w) => (
              <li key={w.id}>
                <span lang="ar" dir="rtl" className="arabic-inline">
                  {w.ar}
                </span>
                <span className="muted">{w.de}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
