import { Link } from 'react-router-dom';
import {
  QUEST_XP,
  type EngagementSummary,
  type QuestDef,
  type QuestStatus,
} from '@suffa/engagement';
import { Icon, type IconName } from '@/components/Icon';

/** Where a quest is done: reviews in the review session, the rest in the current unit. */
export function questLink(quest: QuestDef, unit: number): string {
  const metric = quest.metric;
  if (metric.kind === 'tracks') return `/units/${unit}/listen`;
  if (metric.kind === 'videos') return '/videos';
  if (metric.kind === 'practice') {
    const skill = metric.skills?.[0];
    // A conversation with al-Muʿallim happens on the tutor page, not in a unit station.
    if (skill === 'tutor') return '/tutor';
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
          Tagesaufgaben
        </h2>
        <span className="muted" style={{ fontSize: '0.9rem' }}>
          {done} von 3 · Bonus +{QUEST_XP.bonus} XP
        </span>
      </div>
      <ul className="quest-list">
        {quests.map((q) => (
          <QuestItem key={q.quest.id} status={q} to={questLink(q.quest, unit)} />
        ))}
      </ul>
      {next ? (
        <Link className="btn btn-primary btn-lg" to={questLink(next.quest, unit)}>
          Weiterlernen
          <span className="muted-on-primary">· ≈ {minutes} Min.</span>
          <Icon name="arrowRight" size={20} />
        </Link>
      ) : (
        <p className="feedback-good" style={{ margin: 0, fontWeight: 600 }}>
          {bonusAt
            ? `Alle drei geschafft – Bonus +${QUEST_XP.bonus} XP. Bārak Allāhu fīk!`
            : 'Alles erledigt für heute. Masha’Allah!'}
        </p>
      )}
      <div className="quest-meta">
        <span className="row" style={{ gap: '0.35rem' }}>
          <Icon name="flame" size={16} />
          {streak.current === 0
            ? 'Serie startet mit der ersten Aufgabe'
            : `${streak.current} ${streak.current === 1 ? 'Tag' : 'Tage'} in Folge${
                streak.activeToday ? '' : ' – heute noch offen'
              }`}
        </span>
        <span
          className="row"
          style={{ gap: '0.35rem' }}
          title="Für je 7 Tage in Folge gibt es einen Schutz (höchstens 2). Er deckt einen verpassten Tag."
        >
          <Icon name="shield" size={16} />
          {streak.shields === 0
            ? 'Kein Pausentag-Schutz'
            : `${streak.shields} Pausentag-Schutz`}
        </span>
        <span className="row" style={{ gap: '0.35rem' }}>
          <Icon name="path" size={16} />
          {weekly.met
            ? `Wochenziel erreicht (${weekly.activeDays}/${weekly.goal})`
            : `Woche: ${weekly.activeDays}/${weekly.goal} Tage · noch ${weekLeft}`}
          {weekly.streak > 1 ? ` · ${weekly.streak} Wochen in Folge` : ''}
        </span>
      </div>
    </section>
  );
}

function QuestItem({ status, to }: { status: QuestStatus; to: string }) {
  const { quest, progress, done } = status;
  return (
    <li className={`quest${done ? ' quest-done' : ''}`}>
      <Link to={to} className="quest-body">
        <span className="quest-icon" aria-hidden>
          <Icon name={done ? 'check' : SLOT_ICON[quest.slot]} size={18} />
        </span>
        <span className="stack" style={{ gap: '0.3rem', flex: 1 }}>
          <span
            className="row"
            style={{ justifyContent: 'space-between', gap: '0.5rem' }}
          >
            <span className="quest-title">
              {quest.title}
              {done && <span className="visually-hidden"> (erledigt)</span>}
            </span>
            <span className="muted quest-xp">+{quest.xp} XP</span>
          </span>
          <span
            className="review-progress"
            role="progressbar"
            aria-label={quest.title}
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
