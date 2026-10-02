/**
 * Members of a class (story 4.3): invite link and QR code, approving who joins, removing
 * learners, and deleting the class. Teachers only.
 */
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useNavigate } from 'react-router-dom';
import type { ClassesApi, ClassSummary, Member } from '@/services/classes/classesApi';

const date = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

export function ClassMembers({
  api,
  summary,
  onChange,
}: {
  api: ClassesApi;
  summary: ClassSummary;
  onChange: () => Promise<void>;
}) {
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
        <strong>Mitglieder</strong>
        <span className="muted">
          {summary.studentCount} Lernende
          {summary.pendingCount > 0 && ` · ${summary.pendingCount} warten`}
        </span>
      </div>
      {!invite ? (
        <button
          className="btn"
          onClick={() => void createInvite()}
          style={{ alignSelf: 'flex-start' }}
        >
          Einladungslink &amp; QR-Code
        </button>
      ) : (
        <div className="stack" style={{ alignItems: 'flex-start' }}>
          <img
            src={invite.qr}
            alt={`QR-Code zum Beitritt in ${summary.name}`}
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
              Link kopieren
            </button>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              gültig bis {date(invite.expiresAt)} · ein neuer Link ersetzt diesen
            </span>
          </span>
        </div>
      )}
      {pending.length > 0 && (
        <strong style={{ fontSize: '0.95rem' }}>Warten auf Freigabe</strong>
      )}
      {pending.map((m) => (
        <div key={m.userId} className="row" style={{ justifyContent: 'space-between' }}>
          <span>{m.name ?? m.email}</span>
          <span className="row">
            <button
              className="btn btn-primary"
              onClick={() => void act(() => api.approve(summary.id, m.userId))}
            >
              Freigeben
            </button>
            <button
              className="btn"
              onClick={() => void act(() => api.remove(summary.id, m.userId))}
            >
              Ablehnen
            </button>
          </span>
        </div>
      ))}
      {students.length > 0 && <strong style={{ fontSize: '0.95rem' }}>Lernende</strong>}
      {students.map((m) => (
        <div key={m.userId} className="row" style={{ justifyContent: 'space-between' }}>
          <span>
            {m.name ?? m.email}
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {' '}
              · seit {date(m.joinedAt)}
            </span>
          </span>
          <button
            className="btn"
            onClick={() => {
              if (window.confirm(`${m.name ?? m.email} aus der Klasse entfernen?`)) {
                void act(() => api.remove(summary.id, m.userId));
              }
            }}
          >
            Entfernen
          </button>
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
        Klasse löschen
      </h3>
      {!open ? (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            Die Klasse verschwindet für alle Mitglieder, offene Einladungen werden
            ungültig.
          </span>
          <button type="button" className="btn btn-danger" onClick={() => setOpen(true)}>
            Klasse löschen …
          </button>
        </div>
      ) : (
        <form
          className="stack"
          aria-label="Klasse löschen bestätigen"
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim() === summary.name && !busy) void remove();
          }}
        >
          <label className="stack" style={{ gap: '0.3rem' }}>
            <span>
              Zum Bestätigen den Namen der Klasse eingeben:{' '}
              <strong>{summary.name}</strong>
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
              {busy ? 'Wird gelöscht …' : 'Endgültig löschen'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setOpen(false);
                setTyped('');
              }}
            >
              Abbrechen
            </button>
          </div>
          {error && <span className="feedback-bad">{error}</span>}
        </form>
      )}
    </section>
  );
}
