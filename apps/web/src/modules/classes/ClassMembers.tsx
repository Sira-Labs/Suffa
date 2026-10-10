/**
 * Members of a class (story 4.3): invite link and QR code, approving who joins, removing
 * learners, and deleting the class. Teachers only.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import QRCode from 'qrcode';
import { useNavigate } from 'react-router-dom';
import { dateLocale } from '@/i18n/format';
import type { ClassesApi, ClassSummary, Member } from '@/services/classes/classesApi';
import type { SharingApi } from '@/services/sharing/sharingApi';

const date = (iso: string) => new Date(iso).toLocaleDateString(dateLocale());

export function ClassMembers({
  api,
  sharing,
  summary,
  onChange,
}: {
  api: ClassesApi;
  /** Parents' consent for sharing recordings in classes of minors (story 15.4). */
  sharing?: SharingApi;
  summary: ClassSummary;
  onChange: () => Promise<void>;
}) {
  const { t } = useTranslation(['classes', 'common']);
  const [invite, setInvite] = useState<{
    url: string;
    expiresAt: string;
    qr: string;
  } | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    const result = await api.members(summary.id);
    if (result.ok) setMembers(result.value.members);
    else setMessage(result.message);
  }, [api, summary.id]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const createInvite = async () => {
    const result = await api.invite(summary.id);
    if (!result.ok) return setMessage(result.message);
    const qr = await QRCode.toDataURL(result.value.url, { margin: 1, width: 240 });
    setInvite({ ...result.value, qr });
  };

  const act = async (run: () => Promise<{ ok: boolean; message?: string }>) => {
    const result = await run();
    if (!result.ok) setMessage(result.message ?? null);
    await Promise.all([loadMembers(), onChange()]);
  };

  const pending = members?.filter((m) => m.status === 'pending') ?? [];
  const students =
    members?.filter((m) => m.status === 'active' && m.classRole === 'student') ?? [];

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <strong>{t('members.title')}</strong>
        <span className="muted">
          {t('learners', { count: summary.studentCount })}
          {summary.pendingCount > 0 &&
            ` · ${t('waiting', { count: summary.pendingCount })}`}
        </span>
      </div>
      {!invite ? (
        <button
          className="btn"
          onClick={() => void createInvite()}
          style={{ alignSelf: 'flex-start' }}
        >
          {t('members.invite')}
        </button>
      ) : (
        <div className="stack" style={{ alignItems: 'flex-start' }}>
          <img
            src={invite.qr}
            alt={t('members.qrAlt', { name: summary.name })}
            width={240}
            height={240}
          />
          <span style={{ wordBreak: 'break-all' }}>
            <code>{invite.url}</code>
          </span>
          <span className="row">
            <button
              className="btn"
              onClick={() => void navigator.clipboard?.writeText(invite.url)}
            >
              {t('members.copy')}
            </button>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {t('members.validUntil', { date: date(invite.expiresAt) })}
            </span>
          </span>
        </div>
      )}
      {pending.length > 0 && (
        <strong style={{ fontSize: '0.95rem' }}>{t('members.pending')}</strong>
      )}
      {pending.map((m) => (
        <div key={m.userId} className="row" style={{ justifyContent: 'space-between' }}>
          <span>{m.name ?? m.email}</span>
          <span className="row">
            <button
              className="btn btn-primary"
              onClick={() => void act(() => api.approve(summary.id, m.userId))}
            >
              {t('members.approve')}
            </button>
            <button
              className="btn"
              onClick={() => void act(() => api.remove(summary.id, m.userId))}
            >
              {t('members.reject')}
            </button>
          </span>
        </div>
      ))}
      {students.length > 0 && (
        <strong style={{ fontSize: '0.95rem' }}>{t('members.learners')}</strong>
      )}
      {students.length > 0 && summary.minors && sharing && (
        <span className="muted" style={{ fontSize: '0.85rem' }}>
          {t('members.minorsHint')}
        </span>
      )}
      {students.map((m) => (
        <div key={m.userId} className="row" style={{ justifyContent: 'space-between' }}>
          <span>
            {m.name ?? m.email}
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {' '}
              {t('members.since', { date: date(m.joinedAt) })}
            </span>
          </span>
          <span className="row">
            {summary.minors && sharing && (
              <label
                className="row muted"
                style={{ gap: '0.35rem', fontSize: '0.85rem' }}
              >
                <input
                  type="checkbox"
                  checked={m.parentalConsent ?? false}
                  onChange={(e) => {
                    const consent = e.target.checked;
                    if (!consent && !window.confirm(t('members.removeConsentConfirm'))) {
                      return;
                    }
                    void act(() => sharing.setConsent(summary.id, m.userId, consent));
                  }}
                />
                {t('members.consent')}
              </label>
            )}
            <button
              className="btn"
              onClick={() => {
                if (
                  window.confirm(t('members.removeConfirm', { name: m.name ?? m.email }))
                ) {
                  void act(() => api.remove(summary.id, m.userId));
                }
              }}
            >
              {t('common:remove')}
            </button>
          </span>
        </div>
      ))}
      {message && <span className="feedback-bad">{message}</span>}
      <DeleteClass api={api} summary={summary} />
    </div>
  );
}

/**
 * Deleting the class for everyone. The name has to be typed, so it cannot happen by a slip;
 * learners lose access at once, the data stays with the admins for a while.
 */
function DeleteClass({ api, summary }: { api: ClassesApi; summary: ClassSummary }) {
  const { t } = useTranslation(['classes', 'common']);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    const result = await api.archive(summary.id);
    if (result.ok) return navigate('/classes', { replace: true });
    setBusy(false);
    setError(result.message);
  };

  return (
    <section
      className="stack danger-zone"
      aria-labelledby="delete-class-title"
      style={{ marginTop: '1.5rem' }}
    >
      <h3 id="delete-class-title" style={{ margin: 0 }}>
        {t('deleteClass.title')}
      </h3>
      {!open ? (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {t('deleteClass.intro')}
          </span>
          <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
            {t('deleteClass.open')}
          </button>
        </div>
      ) : (
        <form
          className="stack"
          aria-label={t('deleteClass.confirmForm')}
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim() === summary.name && !busy) void remove();
          }}
        >
          <label className="stack" style={{ gap: '0.3rem' }}>
            <span>
              {t('deleteClass.typeName')} <strong>{summary.name}</strong>
            </span>
            <input
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="row">
            <button
              type="submit"
              className="btn btn-danger"
              disabled={busy || typed.trim() !== summary.name}
            >
              {busy ? t('deleteClass.deleting') : t('deleteClass.forGood')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setOpen(false);
                setTyped('');
              }}
            >
              {t('common:cancel')}
            </button>
          </div>
          {error && <span className="feedback-bad">{error}</span>}
        </form>
      )}
    </section>
  );
}
