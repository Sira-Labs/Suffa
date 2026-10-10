/**
 * Class life (story 6.2): the weekly class challenge, shout-outs and the teacher's badges.
 * Learners see the feed; teachers also set the challenge, write shout-outs and award badges.
 */
import { DEFAULT_COURSE, type CourseId } from '@suffa/engagement';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { dateLocale } from '@/i18n/format';
import {
  BADGE_ICONS,
  CHALLENGE_SUGGESTED,
  type BadgeIcon,
  type Challenge,
  type ChallengeTemplate,
  type ClassesApi,
  type ClassFeed,
  type Member,
} from '@/services/classes/classesApi';
import { useLearnerTimeZone } from '@/modules/engagement/useEngagement';
import { Assignments } from './Assignments';
import { LeagueCard } from './LeagueCard';
import { QuizEntry } from './QuizEntry';

const TEMPLATES = Object.keys(CHALLENGE_SUGGESTED) as ChallengeTemplate[];

export function ClassLife({
  api,
  classId,
  teacher,
  course = DEFAULT_COURSE,
}: {
  api: ClassesApi;
  classId: string;
  teacher: boolean;
  course?: CourseId;
}) {
  const { t } = useTranslation('classes');
  const [feed, setFeed] = useState<ClassFeed | null>(null);
  const [students, setStudents] = useState<Member[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.feed(classId);
    if (result.ok) setFeed(result.value);
    else setMessage(result.message);
    if (teacher) {
      const members = await api.members(classId);
      if (members.ok) {
        setStudents(
          members.value.members.filter(
            (m) => m.classRole === 'student' && m.status === 'active'
          )
        );
      }
    }
  }, [api, classId, teacher]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<{ ok: boolean; message?: string }>) => {
    const result = await action();
    setMessage(result.ok ? null : (result.message ?? null));
    await load();
    return result.ok;
  };

  if (!feed) return <p className="muted">{message ?? t('life.loading')}</p>;
  const date = new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short' });

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      {message && <p className="feedback-bad">{message}</p>}
      <QuizEntry classId={classId} teacher={teacher} />
      <ChallengeCard challenge={feed.challenge} />
      <LeagueCard api={api} classId={classId} teacher={teacher} />
      <Assignments classId={classId} teacher={teacher} course={course} />
      {teacher && (
        <ChallengeEditor
          current={feed.challenge}
          onSave={(template, target, timeZone) =>
            run(() => api.setChallenge(classId, { template, target, timeZone }))
          }
          onRemove={() => run(() => api.removeChallenge(classId))}
        />
      )}

      <section className="card stack" aria-labelledby="shoutouts-title">
        <h2 id="shoutouts-title" className="eyebrow">
          {t('shoutouts.title')}
        </h2>
        {teacher && (
          <ShoutoutForm
            students={students}
            onSend={(text, userId) => run(() => api.shoutout(classId, text, userId))}
          />
        )}
        {feed.shoutouts.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {teacher ? t('shoutouts.emptyTeacher') : t('shoutouts.emptyLearner')}
          </p>
        ) : (
          <ul className="feed-list">
            {feed.shoutouts.map((s) => (
              <li key={s.id} className={`feed-item${s.toYou ? ' feed-item-you' : ''}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    {t('shoutouts.meta', {
                      author: s.author ?? t('shoutouts.teacher'),
                      to: s.toYou
                        ? t('shoutouts.you')
                        : (s.to ?? t('shoutouts.everyone')),
                      date: date.format(new Date(s.createdAt)),
                    })}
                  </span>
                  {teacher && (
                    <button
                      className="btn btn-small"
                      onClick={() => void run(() => api.removeShoutout(classId, s.id))}
                    >
                      {t('delete')}
                    </button>
                  )}
                </div>
                <p style={{ margin: '0.25rem 0 0' }}>{s.message}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack" aria-labelledby="teacher-badges-title">
        <h2 id="teacher-badges-title" className="eyebrow">
          {t('badges.title')}
        </h2>
        {teacher && (
          <BadgeForm onCreate={(badge) => run(() => api.createBadge(classId, badge))} />
        )}
        {feed.badges.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t('badges.none')}
          </p>
        ) : (
          <ul className="feed-list">
            {feed.badges.map((b) => (
              <li key={b.id} className="feed-item stack" style={{ gap: '0.4rem' }}>
                <span className="row" style={{ gap: '0.5rem' }}>
                  <Icon name={b.icon} size={20} />
                  <strong>{b.name}</strong>
                </span>
                {b.message && <span className="muted">{b.message}</span>}
                <span style={{ fontSize: '0.9rem' }}>
                  {b.awards.length === 0
                    ? t('badges.notAwarded')
                    : t('badges.awardedTo', {
                        names: b.awards
                          .map((a) =>
                            a.you ? t('badges.you') : (a.name ?? t('badges.learner'))
                          )
                          .join(', '),
                      })}
                </span>
                {teacher && students.length > 0 && (
                  <AwardForm
                    students={students.filter(
                      (s) => !b.awards.some((a) => a.userId === s.userId)
                    )}
                    onAward={(userId) => run(() => api.award(classId, b.id, userId))}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** This week's shared target; also used on "Heute". */
export function ChallengeCard({ challenge }: { challenge: Challenge | null }) {
  const { t } = useTranslation('classes');
  if (!challenge) {
    return (
      <section className="card class-challenge" aria-label={t('challenge.label')}>
        <p className="muted" style={{ margin: 0 }}>
          {t('challenge.none')}
        </p>
      </section>
    );
  }
  const shown = Math.min(challenge.progress, challenge.target);
  return (
    <section className="card stack class-challenge" aria-labelledby="challenge-title">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="challenge-title" className="eyebrow">
          {t('challenge.title')}
        </h2>
        {challenge.reached && (
          <span className="badge badge-done">{t('challenge.reached')}</span>
        )}
      </div>
      <strong>
        {t('challenge.goal', {
          target: challenge.target,
          unit: t(`challenge.templates.${challenge.template}.unit`),
          title: t(`challenge.templates.${challenge.template}.title`),
        })}
      </strong>
      <span
        className="review-progress"
        role="progressbar"
        aria-label={t('challenge.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={challenge.target}
        aria-valuenow={shown}
      >
        <span
          style={{
            display: 'block',
            height: '100%',
            width: `${(shown / challenge.target) * 100}%`,
          }}
        />
      </span>
      <span className="muted" style={{ fontSize: '0.9rem' }}>
        {t('challenge.contributors', {
          progress: challenge.progress,
          target: challenge.target,
          count: challenge.contributors,
        })}
        {challenge.yours !== null && t('challenge.yours', { yours: challenge.yours })}
      </span>
      {challenge.reached && (
        <span className="feedback-good" style={{ fontWeight: 600 }}>
          {t('challenge.done')}
        </span>
      )}
    </section>
  );
}

function ChallengeEditor({
  current,
  onSave,
  onRemove,
}: {
  current: Challenge | null;
  onSave: (
    template: ChallengeTemplate,
    target: number,
    timeZone: string
  ) => Promise<boolean>;
  onRemove: () => Promise<boolean>;
}) {
  const { t } = useTranslation(['classes', 'common']);
  const timeZone = useLearnerTimeZone();
  const [template, setTemplate] = useState<ChallengeTemplate>(
    current?.template ?? 'reviews'
  );
  const [target, setTarget] = useState(current?.target ?? CHALLENGE_SUGGESTED.reviews);
  if (current?.reached) return null;
  return (
    <form
      className="card stack"
      aria-label={t('challenge.editor.label')}
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(template, target, timeZone);
      }}
    >
      <strong>
        {current ? t('challenge.editor.change') : t('challenge.editor.set')}
      </strong>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select
          className="input"
          aria-label={t('challenge.editor.kind')}
          value={template}
          onChange={(e) => {
            const next = e.target.value as ChallengeTemplate;
            setTemplate(next);
            setTarget(CHALLENGE_SUGGESTED[next]);
          }}
        >
          {TEMPLATES.map((key) => (
            <option key={key} value={key}>
              {t(`challenge.templates.${key}.title`)}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="number"
          min={1}
          max={100000}
          aria-label={t('challenge.editor.target')}
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          style={{ width: 120 }}
        />
        <span className="muted">
          {t('challenge.editor.together', {
            unit: t(`challenge.templates.${template}.unit`),
          })}
        </span>
        <button className="btn btn-primary" type="submit" disabled={!(target >= 1)}>
          {t('common:save')}
        </button>
        {current && (
          <button className="btn" type="button" onClick={() => void onRemove()}>
            {t('common:remove')}
          </button>
        )}
      </div>
      <span className="muted" style={{ fontSize: '0.85rem' }}>
        {t('challenge.editor.hint')}
      </span>
    </form>
  );
}

function ShoutoutForm({
  students,
  onSend,
}: {
  students: Member[];
  onSend: (text: string, userId: string | null) => Promise<boolean>;
}) {
  const { t } = useTranslation('classes');
  const [text, setText] = useState('');
  const [to, setTo] = useState('');
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void onSend(text.trim(), to || null).then((ok) => ok && setText(''));
      }}
    >
      <textarea
        className="input"
        aria-label={t('shoutouts.label')}
        placeholder={t('shoutouts.placeholder')}
        maxLength={280}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row">
        <select
          className="input"
          aria-label={t('shoutouts.to')}
          value={to}
          onChange={(e) => setTo(e.target.value)}
        >
          <option value="">{t('shoutouts.wholeClass')}</option>
          {students.map((s) => (
            <option key={s.userId} value={s.userId}>
              {s.name ?? s.email}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit" disabled={!text.trim()}>
          {t('shoutouts.send')}
        </button>
      </div>
    </form>
  );
}

function BadgeForm({
  onCreate,
}: {
  onCreate: (badge: {
    name: string;
    icon: BadgeIcon;
    message: string;
  }) => Promise<boolean>;
}) {
  const { t } = useTranslation('classes');
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<BadgeIcon>('award');
  const [message, setMessage] = useState('');
  return (
    <form
      className="row"
      style={{ flexWrap: 'wrap' }}
      onSubmit={(e) => {
        e.preventDefault();
        void onCreate({ name: name.trim(), icon, message: message.trim() }).then(
          (ok) => ok && (setName(''), setMessage(''))
        );
      }}
    >
      <input
        className="input"
        aria-label={t('badges.name')}
        placeholder={t('badges.namePlaceholder')}
        maxLength={40}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select
        className="input"
        aria-label={t('badges.icon')}
        value={icon}
        onChange={(e) => setIcon(e.target.value as BadgeIcon)}
      >
        {BADGE_ICONS.map((i) => (
          <option key={i} value={i}>
            {t(`badges.icons.${i}`)}
          </option>
        ))}
      </select>
      <input
        className="input"
        aria-label={t('badges.message')}
        placeholder={t('badges.messagePlaceholder')}
        maxLength={200}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        style={{ flex: 1, minWidth: 160 }}
      />
      <button className="btn" type="submit" disabled={!name.trim()}>
        {t('badges.create')}
      </button>
    </form>
  );
}

function AwardForm({
  students,
  onAward,
}: {
  students: Member[];
  onAward: (userId: string) => Promise<boolean>;
}) {
  const { t } = useTranslation('classes');
  const [userId, setUserId] = useState('');
  if (students.length === 0) return null;
  return (
    <form
      className="row"
      onSubmit={(e) => {
        e.preventDefault();
        if (userId) void onAward(userId).then(() => setUserId(''));
      }}
    >
      <select
        className="input"
        aria-label={t('badges.awardTo')}
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
      >
        <option value="">{t('badges.awardToPlaceholder')}</option>
        {students.map((s) => (
          <option key={s.userId} value={s.userId}>
            {s.name ?? s.email}
          </option>
        ))}
      </select>
      <button className="btn btn-small" type="submit" disabled={!userId}>
        {t('badges.award')}
      </button>
    </form>
  );
}
