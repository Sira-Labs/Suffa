import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  courseOfUnit,
  QUEST_XP,
  type EngagementSummary,
  type QuestDef,
  type QuestStatus,
} from '@suffa/engagement';
import { Icon, type IconName } from '@/components/Icon';
import { madinahLessonPath } from '@/services/courses';
import { questTitle } from './labels';

/** Where a quest is done: reviews in the review session, the rest in the current unit. */
export function questLink(quest: QuestDef, unit: number): string {
  const metric = quest.metric;
  // A Medina lesson has all its exercises on one page, no stations.
  const lessonPage =
    courseOfUnit(unit)?.id === 'madinah' ? madinahLessonPath(unit) : null;
  if (metric.kind === 'tracks') return lessonPage ?? `/units/${unit}/listen`;
  if (metric.kind === 'videos') return '/videos';
  if (metric.kind === 'practice') {
    const skill = metric.skills?.[0];
    // A conversation with al-Muʿallim happens on the tutor page, not in a unit station.
    if (skill === 'tutor') return '/tutor';
    if (lessonPage) return lessonPage;
    return skill ? `/units/${unit}/${skill}` : `/units/${unit}`;
  }
  return '/review';
}

/** Rough minutes per remaining step of a quest, for the estimate on "Heute". */
const MINUTES_PER_STEP: Record<QuestDef['metric']['kind'], number> = {
  reviews: 0.4,
  correct: 0.4,
  'new-cards': 1,
  tracks: 3,
  videos: 6,
  practice: 1,
};

/** Minutes the open quests still take (at least 1 while any is open, 0 when all are done). */
export function questMinutes(quests: readonly QuestStatus[]): number {
  const open = quests.filter((q) => !q.done);
  if (open.length === 0) return 0;
  const minutes = open.reduce((sum, q) => {
    const left = Math.max(0, q.quest.target - q.progress);
    const perStep =
      q.quest.metric.kind === 'practice' && q.quest.metric.skills?.[0] === 'tutor'
        ? 5
        : MINUTES_PER_STEP[q.quest.metric.kind];
    return sum + left * perStep;
  }, 0);
  return Math.max(1, Math.round(minutes));
}

const SLOT_ICON: Record<QuestDef['slot'], IconName> = {
  review: 'cards',
  learn: 'listen',
  produce: 'write',
};

/** The icon of a quest: what it is about where that differs from its slot. */
export function questIcon(quest: QuestDef): IconName {
  const metric = quest.metric;
  if (metric.kind === 'videos') return 'play';
  if (metric.kind === 'new-cards') return 'cards';
  if (metric.kind === 'practice' && metric.skills?.[0] === 'words') return 'cards';
  return SLOT_ICON[quest.slot];
}

/**
 * "Tagesaufgaben" (story 5.2): the day's three quests with progress, the bonus for all
 * three, and how the streak and the weekly goal stand. The one plan for today: the
 * "Weiterlernen" button opens the first open quest, with the minutes still to go. Works
 * fully offline.
 */
export function TodayQuests({
  summary,
  unit,
}: {
  summary: EngagementSummary;
  unit: number;
}) {
  const { t } = useTranslation('engagement');
  const { quests, bonusAt } = summary.quests;
  const done = quests.filter((q) => q.done).length;
  // The first open quest is today's next step; the button leads straight to it.
  const next = quests.find((q) => !q.done);
  const minutes = questMinutes(quests);
  const { streak, weekly } = summary;
  const weekLeft = Math.max(0, weekly.goal - weekly.activeDays);

  return (
    <section className="card stack quests-card" aria-labelledby="quests-title">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="quests-title" className="eyebrow">
          {t('today.title')}
        </h2>
        <span className="muted" style={{ fontSize: '0.9rem' }}>
          {t('today.count', { done, xp: QUEST_XP.bonus })}
        </span>
      </div>
      <ul className="quest-list">
        {quests.map((q) => (
          <QuestItem key={q.quest.id} status={q} to={questLink(q.quest, unit)} />
        ))}
      </ul>
      {next ? (
        <Link className="btn btn-primary btn-lg" to={questLink(next.quest, unit)}>
          {t('today.keepLearning')}
          <span className="muted-on-primary">{t('today.minutes', { minutes })}</span>
          <Icon name="arrowRight" size={20} />
        </Link>
      ) : (
        <p className="feedback-good" style={{ margin: 0, fontWeight: 600 }}>
          {bonusAt ? t('today.allThree', { xp: QUEST_XP.bonus }) : t('today.allDone')}
        </p>
      )}
      <div className="quest-meta">
        <span className="row" style={{ gap: '0.35rem' }}>
          <Icon name="flame" size={16} />
          {streak.current === 0
            ? t('today.streakStarts')
            : streak.activeToday
              ? t('today.streak', { count: streak.current })
              : t('today.streakOpen', { count: streak.current })}
        </span>
        <span className="row" style={{ gap: '0.35rem' }} title={t('today.shieldHint')}>
          <Icon name="shield" size={16} />
          {streak.shields === 0
            ? t('today.noShield')
            : t('today.shields', { count: streak.shields })}
        </span>
        <span className="row" style={{ gap: '0.35rem' }}>
          <Icon name="path" size={16} />
          {weekly.met
            ? t('today.weeklyMet', { days: weekly.activeDays, goal: weekly.goal })
            : t('today.weekly', {
                days: weekly.activeDays,
                goal: weekly.goal,
                left: weekLeft,
              })}
          {weekly.streak > 1 ? t('today.weeksInARow', { weeks: weekly.streak }) : ''}
        </span>
      </div>
    </section>
  );
}

function QuestItem({ status, to }: { status: QuestStatus; to: string }) {
  const { t } = useTranslation('engagement');
  const { quest, progress, done } = status;
  const title = questTitle(quest);
  return (
    <li className={`quest${done ? ' quest-done' : ''}`}>
      <Link to={to} className="quest-body">
        <span className="quest-icon" aria-hidden>
          <Icon name={done ? 'check' : questIcon(quest)} size={18} />
        </span>
        <span className="stack" style={{ gap: '0.3rem', flex: 1 }}>
          <span
            className="row"
            style={{ justifyContent: 'space-between', gap: '0.5rem' }}
          >
            <span className="quest-title">
              {title}
              {done && <span className="visually-hidden">{` (${t('today.done')})`}</span>}
            </span>
            <span className="muted quest-xp">{t('today.xp', { xp: quest.xp })}</span>
          </span>
          <span
            className="review-progress"
            role="progressbar"
            aria-label={title}
            aria-valuemin={0}
            aria-valuemax={quest.target}
            aria-valuenow={progress}
          >
            <span
              style={{ display: 'block', width: `${(progress / quest.target) * 100}%` }}
            />
          </span>
        </span>
        <span className="muted quest-count">
          {progress}/{quest.target}
        </span>
      </Link>
    </li>
  );
}
