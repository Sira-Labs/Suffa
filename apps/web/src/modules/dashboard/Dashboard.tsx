import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ReviewLog } from '@/types';
import { content } from '@/content';
import { ArabicText } from '@/components';
import { Icon } from '@/components/Icon';
import { reviewLogRepo } from '@/services/storage';
import { isTtsSupported, speakArabic } from '@/services/speech';
import { computeStreak, masteryBuckets, reviewHeatmap } from '@/services/stats';
import { buildTodayPlan, localDay, reviewsToday, wordOfTheDay } from '@/services/today';
import {
  listeningXpEvents,
  practiceXpEvents,
  unitOnTimeXpEvents,
  reviewXpEvents,
  startOfWeek,
  sumXp,
} from '@/services/engagement/xp';
import { lessonSizes, loadPublisherIndex } from '@/services/audio/publisherIndex';
import type { TodayStep } from '@/services/today';
import { ForgettingReminder } from './ForgettingReminder';
import {
  useEnrollmentStore,
  useListenStore,
  usePracticeStore,
  useSettingsStore,
  useSrsStore,
} from '@/state';
import { CurrentUnitCard } from './CurrentUnitCard';

const DATE_FORMAT = new Intl.DateTimeFormat('de-DE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/** "Heute": today's path with one clear next step, the word of the day, then progress. */
export function Dashboard() {
  const cards = useSrsStore((s) => s.cards);
  const summary = useSrsStore((s) => s.summary)();
  const dailyGoal = useSettingsStore((s) => s.settings.dailyGoal);
  const [logs, setLogs] = useState<ReviewLog[]>([]);
  const listening = useListenStore((s) => s.progress);
  const practised = usePracticeStore((s) => s.records);
  const enrollments = useEnrollmentStore((s) => s.enrollments);
  const exams = useEnrollmentStore((s) => s.exams);
  const [sizes, setSizes] = useState<ReadonlyMap<string, number>>(new Map());

  useEffect(() => {
    void reviewLogRepo.all().then(setLogs);
  }, [cards]);

  useEffect(() => {
    let cancelled = false;
    // Lesson sizes (for lesson bonuses) come from the lazily loaded audio index.
    void loadPublisherIndex().then((index) => {
      if (!cancelled) setSizes(lessonSizes(index));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const mastery = masteryBuckets(cards);
  const streak = computeStreak(logs);
  const heat = reviewHeatmap(logs);
  const maxHeat = Math.max(1, ...heat.map((h) => h.count));
  const today = reviewsToday(logs);
  const heard = Object.values(listening).filter((p) => p.completedAt);
  const todayKey = localDay(new Date());
  const heardToday = heard.filter(
    (p) => localDay(new Date(p.completedAt!)) === todayKey
  ).length;
  const weekXp = sumXp(
    [
      ...reviewXpEvents(logs),
      ...listeningXpEvents(heard, sizes),
      ...practiceXpEvents(Object.values(practised)),
      ...unitOnTimeXpEvents(Object.values(enrollments), exams),
    ],
    startOfWeek()
  );
  const plan = buildTodayPlan({
    dueCount: summary.dueCount,
    newCount: summary.newCount,
    leechCount: summary.leechCount,
    dailyGoal,
    reviewedToday: today.reviewed,
    newLearnedToday: today.newLearned,
    heardToday,
  });
  const current = plan.steps.find((s) => s.state === 'current');
  const word = wordOfTheDay(content.vokabeln);

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

      <ForgettingReminder cards={cards} logs={logs} />
      <CurrentUnitCard />

      <div className="today-grid">
        <section
          className="card stack"
          aria-labelledby="today-path"
          style={{ gap: '1.25rem' }}
        >
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2 id="today-path" className="eyebrow">
              Dein Weg heute
            </h2>
            <span className="muted" style={{ fontSize: '0.9rem' }}>
              ≈ {plan.minutes} Min.
            </span>
          </div>
          <ol className="today-steps">
            {plan.steps.map((step, i) => (
              <TodayStepItem key={step.id} step={step} index={i + 1} />
            ))}
          </ol>
          {current ? (
            <Link className="btn btn-primary btn-lg" to={current.to}>
              Weiterlernen
              <Icon name="arrowRight" size={20} />
            </Link>
          ) : (
            <p className="feedback-good" style={{ margin: 0, fontWeight: 600 }}>
              Alles erledigt für heute. Masha’Allah!
            </p>
          )}
        </section>

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
          </section>
        )}
      </div>

      <section className="stack" aria-labelledby="progress" style={{ gap: '1rem' }}>
        <h2 id="progress" className="eyebrow">
          Fortschritt
        </h2>
        <div
          className="grid"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}
        >
          <Stat label="Fällig heute" value={summary.dueCount} accent="var(--info)" />
          <Stat label="Neu verfügbar" value={summary.newCount} accent="var(--accent)" />
          <Stat label="Reif" value={mastery.reif} accent="var(--good)" />
          <Stat label="Schwierig" value={summary.leechCount} accent="var(--bad)" />
        </div>

        <div className="card stack">
          <strong>Beherrschung</strong>
          <MasteryBar mastery={mastery} />
        </div>
        <div className="card stack">
          <strong>Aktivität (letzte 28 Tage)</strong>
          <div className="row" style={{ gap: 4 }} aria-label="Wiederholungs-Heatmap">
            {heat.map((cell) => {
              const intensity = cell.count / maxHeat;
              return (
                <span
                  key={cell.date}
                  title={`${cell.date}: ${cell.count} Wiederholungen`}
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 3,
                    background:
                      cell.count === 0
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

function TodayStepItem({ step, index }: { step: TodayStep; index: number }) {
  const stateLabel =
    step.state === 'done'
      ? 'erledigt'
      : step.state === 'current'
        ? 'als Nächstes'
        : 'danach';
  return (
    <li className={`today-step today-step-${step.state}`}>
      <span className="today-step-marker" aria-hidden>
        {step.state === 'done' ? (
          <Icon name="check" size={18} strokeWidth={2.5} />
        ) : (
          index
        )}
      </span>
      <Link to={step.to} className="today-step-body">
        <span className="today-step-label">
          {step.label}
          <span className="visually-hidden"> ({stateLabel})</span>
        </span>
        <span className="muted" style={{ fontSize: '0.9rem' }}>
          {step.detail}
        </span>
      </Link>
    </li>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: string;
}) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, color: accent }}>{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}

function MasteryBar({ mastery }: { mastery: ReturnType<typeof masteryBuckets> }) {
  const segments = [
    { key: 'neu', value: mastery.neu, color: 'var(--accent)', label: 'Neu' },
    { key: 'lernend', value: mastery.lernend, color: 'var(--info)', label: 'Lernend' },
    { key: 'reif', value: mastery.reif, color: 'var(--good)', label: 'Reif' },
  ];
  const total = Math.max(1, mastery.neu + mastery.lernend + mastery.reif);
  return (
    <div className="stack" style={{ gap: '0.5rem' }}>
      <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden' }}>
        {segments.map((s) => (
          <div
            key={s.key}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="row" style={{ gap: '1rem' }}>
        {segments.map((s) => (
          <span key={s.key} className="muted">
            <span style={{ color: s.color }}>●</span> {s.label}: {s.value}
          </span>
        ))}
      </div>
    </div>
  );
}
