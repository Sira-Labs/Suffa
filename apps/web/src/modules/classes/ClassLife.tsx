/**
 * Class life (story 6.2): the weekly class challenge, shout-outs and the teacher's badges.
 * Learners see the feed; teachers also set the challenge, write shout-outs and award badges.
 */
import { useCallback, useEffect, useState } from 'react';
import { Icon } from '@/components/Icon';
import {
  BADGE_ICONS,
  CHALLENGE_LABELS,
  type BadgeIcon,
  type Challenge,
  type ChallengeTemplate,
  type ClassesApi,
  type ClassFeed,
  type Member,
} from '@/services/classes/classesApi';
import { useLearnerTimeZone } from '@/modules/engagement/useEngagement';
import { Assignments } from './Assignments';

const DATE = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short' });

export function ClassLife({
  api,
  classId,
  teacher,
}: {
  api: ClassesApi;
  classId: string;
  teacher: boolean;
}) {
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

  if (!feed) return <p className="muted">{message ?? 'Lade Klassenleben …'}</p>;

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      {message && <p className="feedback-bad">{message}</p>}
      <ChallengeCard challenge={feed.challenge} />
      <Assignments classId={classId} teacher={teacher} />
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
          Shout-outs
        </h2>
        {teacher && (
          <ShoutoutForm
            students={students}
            onSend={(text, userId) => run(() => api.shoutout(classId, text, userId))}
          />
        )}
        {feed.shoutouts.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {teacher
              ? 'Noch keine Shout-outs. Ein kurzes Lob wirkt Wunder.'
              : 'Noch keine Nachrichten von deiner Lehrkraft.'}
          </p>
        ) : (
          <ul className="feed-list">
            {feed.shoutouts.map((s) => (
              <li key={s.id} className={`feed-item${s.toYou ? ' feed-item-you' : ''}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="muted" style={{ fontSize: '0.85rem' }}>
                    {s.author ?? 'Lehrkraft'} → {s.toYou ? 'dich' : (s.to ?? 'alle')} ·{' '}
                    {DATE.format(new Date(s.createdAt))}
                  </span>
                  {teacher && (
                    <button
                      className="btn btn-small"
                      onClick={() => void run(() => api.removeShoutout(classId, s.id))}
                    >
                      Löschen
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
          Abzeichen der Lehrkraft
        </h2>
        {teacher && (
          <BadgeForm onCreate={(badge) => run(() => api.createBadge(classId, badge))} />
        )}
        {feed.badges.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Noch keine eigenen Abzeichen.
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
                    ? 'Noch nicht vergeben'
                    : `Verliehen an: ${b.awards
                        .map((a) => (a.you ? 'dich' : (a.name ?? 'Lernende:r')))
                        .join(', ')}`}
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
  if (!challenge) {
    return (
      <section className="card class-challenge" aria-label="Klassen-Challenge">
        <p className="muted" style={{ margin: 0 }}>
          Diese Woche gibt es noch keine Klassen-Challenge.
        </p>
      </section>
    );
  }
  const label = CHALLENGE_LABELS[challenge.template];
  const shown = Math.min(challenge.progress, challenge.target);
  return (
    <section className="card stack class-challenge" aria-labelledby="challenge-title">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 id="challenge-title" className="eyebrow">
          Klassen-Challenge dieser Woche
        </h2>
        {challenge.reached && <span className="badge badge-done">geschafft</span>}
      </div>
      <strong>
        Gemeinsam {challenge.target} {label.unit}: {label.title}
      </strong>
      <span
        className="review-progress"
        role="progressbar"
        aria-label="Fortschritt der Klasse"
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
        {challenge.progress} von {challenge.target} · {challenge.contributors}{' '}
        {challenge.contributors === 1 ? 'hat' : 'haben'} mitgemacht
        {challenge.yours !== null && ` · dein Beitrag: ${challenge.yours}`}
      </span>
      {challenge.reached && (
        <span className="feedback-good" style={{ fontWeight: 600 }}>
          Masha’Allah! Alle, die mitgeholfen haben, bekommen das Abzeichen „Rūḥ al-Faṣl“.
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
  const timeZone = useLearnerTimeZone();
  const [template, setTemplate] = useState<ChallengeTemplate>(
    current?.template ?? 'reviews'
  );
  const [target, setTarget] = useState(
    current?.target ?? CHALLENGE_LABELS.reviews.suggested
  );
  if (current?.reached) return null;
  return (
    <form
      className="card stack"
      aria-label="Challenge festlegen"
      onSubmit={(e) => {
        e.preventDefault();
        void onSave(template, target, timeZone);
      }}
    >
      <strong>
        {current ? 'Challenge ändern' : 'Challenge für diese Woche festlegen'}
      </strong>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select
          className="input"
          aria-label="Art der Challenge"
          value={template}
          onChange={(e) => {
            const next = e.target.value as ChallengeTemplate;
            setTemplate(next);
            setTarget(CHALLENGE_LABELS[next].suggested);
          }}
        >
          {Object.entries(CHALLENGE_LABELS).map(([key, value]) => (
            <option key={key} value={key}>
              {value.title}
            </option>
          ))}
        </select>
        <input
          className="input"
          type="number"
          min={1}
          max={100000}
          aria-label="Ziel"
          value={target}
          onChange={(e) => setTarget(Number(e.target.value))}
          style={{ width: 120 }}
        />
        <span className="muted">{CHALLENGE_LABELS[template].unit} gemeinsam</span>
        <button className="btn btn-primary" type="submit" disabled={!(target >= 1)}>
          Speichern
        </button>
        {current && (
          <button className="btn" type="button" onClick={() => void onRemove()}>
            Entfernen
          </button>
        )}
      </div>
      <span className="muted" style={{ fontSize: '0.85rem' }}>
        Ein gemeinsames Ziel, keine Rangliste. Gilt bis Sonntag; wer beiträgt, bekommt
        beim Erreichen das Klassen-Abzeichen.
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
        aria-label="Shout-out"
        placeholder="z. B. Masha’Allah, alle haben diese Woche jeden Tag gelernt!"
        maxLength={280}
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row">
        <select
          className="input"
          aria-label="An"
          value={to}
          onChange={(e) => setTo(e.target.value)}
        >
          <option value="">An die ganze Klasse</option>
          {students.map((s) => (
            <option key={s.userId} value={s.userId}>
              {s.name ?? s.email}
            </option>
          ))}
        </select>
        <button className="btn btn-primary" type="submit" disabled={!text.trim()}>
          Senden
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
        aria-label="Name des Abzeichens"
        placeholder="Name, z. B. Fleißige Biene"
        maxLength={40}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <select
        className="input"
        aria-label="Symbol"
        value={icon}
        onChange={(e) => setIcon(e.target.value as BadgeIcon)}
      >
        {BADGE_ICONS.map((i) => (
          <option key={i} value={i}>
            {ICON_LABELS[i]}
          </option>
        ))}
      </select>
      <input
        className="input"
        aria-label="Nachricht"
        placeholder="Nachricht (optional)"
        maxLength={200}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        style={{ flex: 1, minWidth: 160 }}
      />
      <button className="btn" type="submit" disabled={!name.trim()}>
        Abzeichen anlegen
      </button>
    </form>
  );
}

const ICON_LABELS: Record<BadgeIcon, string> = {
  award: 'Medaille',
  flame: 'Flamme',
  read: 'Buch',
  write: 'Stift',
  speak: 'Mikrofon',
  listen: 'Kopfhörer',
  roots: 'Wurzeln',
  check: 'Haken',
};

function AwardForm({
  students,
  onAward,
}: {
  students: Member[];
  onAward: (userId: string) => Promise<boolean>;
}) {
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
        aria-label="Verleihen an"
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
      >
        <option value="">Verleihen an …</option>
        {students.map((s) => (
          <option key={s.userId} value={s.userId}>
            {s.name ?? s.email}
          </option>
        ))}
      </select>
      <button className="btn btn-small" type="submit" disabled={!userId}>
        Verleihen
      </button>
    </form>
  );
}
