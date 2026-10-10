/**
 * "Fortschritt": the level, the card statistics, the wobbly words and the activity of the
 * last 28 days. Moved off "Heute" (tester feedback R6) so the home page stays short; one
 * row there leads here.
 */
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { dayKey } from '@suffa/engagement';
import { Link } from 'react-router-dom';
import type { SrsCard } from '@/types';
import { content } from '@/content';
import { Icon } from '@/components/Icon';
import { masteryBuckets, weakCards } from '@/services/stats';
import { activityHeatmap, type ActivityCell } from '@/services/activity';
import i18n from '@/i18n';
import {
  useContentStore,
  useEngagementStore,
  useListenStore,
  usePracticeStore,
  useSrsStore,
} from '@/state';
import { LevelCard } from './LevelCard';
import { useEngagement, useLearnerTimeZone } from '@/modules/engagement/useEngagement';

/** "2026-09-26: 2 Übungen, 1 Audio/Video" in the interface language. */
function activityTitle(cell: ActivityCell): string {
  if (cell.total === 0)
    return i18n.t('dashboard:progress.noActivity', { date: cell.date });
  const parts = [
    cell.reviews > 0 && i18n.t('dashboard:progress.reviews', { count: cell.reviews }),
    cell.practice > 0 && i18n.t('dashboard:progress.practice', { count: cell.practice }),
    cell.tracks > 0 && i18n.t('dashboard:progress.tracks', { count: cell.tracks }),
  ].filter(Boolean);
  return `${cell.date}: ${parts.join(', ')}`;
}

export function Progress() {
  const { t } = useTranslation('dashboard');
  const cards = useSrsStore((s) => s.cards);
  const summary = useSrsStore((s) => s.summary)();
  const logs = useEngagementStore((s) => s.logs);
  const refreshLogs = useEngagementStore((s) => s.refresh);
  const engagement = useEngagement();

  useEffect(() => {
    void refreshLogs();
  }, [cards, refreshLogs]);
  const mastery = masteryBuckets(cards);
  const weak = weakCards(cards, logs);
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

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <h1>{t('progress.title')}</h1>
      <LevelCard totalXp={engagement.totalXp} level={engagement.level} />
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}
      >
        <Stat
          label={t('progress.dueToday')}
          hint={t('progress.dueTodayHint')}
          value={summary.dueCount}
          accent="var(--info)"
        />
        <Stat
          label={t('progress.newAvailable')}
          hint={t('progress.newAvailableHint')}
          value={summary.newCount}
          accent="var(--accent)"
        />
        <Stat
          label={t('progress.learning')}
          hint={t('progress.learningHint')}
          value={mastery.lernend}
          accent="var(--text)"
        />
        <Stat
          label={t('progress.secure')}
          hint={t('progress.secureHint')}
          value={mastery.reif}
          accent="var(--good)"
        />
      </div>
      <WeakWords cards={weak} />

      <div className="card stack">
        <strong>{t('progress.activity')}</strong>
        <div className="row" style={{ gap: 4 }} aria-label={t('progress.activityLabel')}>
          {heat.map((cell) => {
            const intensity = cell.total / maxHeat;
            return (
              <span
                key={cell.date}
                title={activityTitle(cell)}
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

      <Link to="/badges" className="card row home-link-row">
        <span className="stack" style={{ gap: 0 }}>
          <strong>{t('progress.badges')}</strong>
          <span className="muted stat-tile-hint">{t('progress.badgesHint')}</span>
        </span>
        <Icon name="award" />
      </Link>
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
  const { t } = useTranslation('dashboard');
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
          <strong>{t('progress.weakWords')}</strong>
          <span className="muted stat-tile-hint">{t('progress.weakWordsHint')}</span>
        </span>
      </summary>
      {words.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          {t('progress.noWeakWords')}
        </p>
      ) : (
        <>
          <Link to="/review?focus=weak" className="btn btn-primary weak-words-cta">
            {t('progress.practiseWeak')}
          </Link>
          <ul className="weak-words-list">
            {words.map((w) => (
              <li key={w.id}>
                <span lang="ar" dir="rtl" className="arabic-inline">
                  {w.ar}
                </span>
                <span className="muted" lang="de">
                  {w.de}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
