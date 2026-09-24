/**
 * Classes (story 4.3): learners see their classes and whether they are approved; teachers
 * create classes, share an invite link or QR code and approve who joins.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import {
  ClassesApi,
  type ClassSummary,
  type Member,
} from '@/services/classes/classesApi';
import { useSyncStore } from '@/state';

const date = (iso: string) => new Date(iso).toLocaleDateString('de-DE');

export function Classes() {
  const provider = useSyncStore((s) => s.provider);
  const auth = useSyncStore((s) => s.auth);
  const api = useMemo(() => new ClassesApi(), []);
  const [classes, setClasses] = useState<ClassSummary[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.list();
    if (result.ok) setClasses(result.value.classes);
    else setMessage(result.message);
  }, [api]);

  useEffect(() => {
    if (auth.status === 'signed-in') void load();
  }, [auth.status, load]);

  if (!(provider instanceof ApiSyncProvider) || auth.status !== 'signed-in') {
    return (
      <div className="stack">
        <h1>Klassen</h1>
        <p className="muted">
          Melde dich unter Einstellungen an, um einer Klasse beizutreten oder eine zu
          führen.
        </p>
      </div>
    );
  }
  const role = provider.currentUser()?.role;
  const canCreate = role === 'teacher' || role === 'admin';

  return (
    <div className="stack">
      <h1>Klassen</h1>
      {message && <span className="feedback-bad">{message}</span>}
      {canCreate && <CreateClass api={api} onCreated={load} />}
      {classes?.length === 0 && (
        <p className="muted">
          {canCreate
            ? 'Noch keine Klasse. Lege oben eine an und teile den Einladungslink.'
            : 'Du bist noch in keiner Klasse. Öffne den Einladungslink oder scanne den QR-Code deiner Lehrkraft.'}
        </p>
      )}
      {classes?.map((c) =>
        c.classRole === 'teacher' ? (
          <TeacherClass key={c.id} api={api} summary={c} onChange={load} />
        ) : (
          <div
            key={c.id}
            className="card row"
            style={{ justifyContent: 'space-between' }}
          >
            <strong>{c.name}</strong>
            <span className={c.status === 'active' ? 'feedback-good' : 'muted'}>
              {c.status === 'active' ? '✓ Mitglied' : 'Wartet auf Freigabe'}
            </span>
          </div>
        )
      )}
    </div>
  );
}

function CreateClass({
  api,
  onCreated,
}: {
  api: ClassesApi;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await api.create(name.trim());
    if (!result.ok) return setMessage(result.message);
    setName('');
    setMessage(null);
    await onCreated();
  };
  return (
    <form className="card row" onSubmit={(e) => void submit(e)}>
      <input
        className="input"
        placeholder="Name der neuen Klasse, z. B. Arabisch 1a"
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.target.value)}
        aria-label="Name der neuen Klasse"
        style={{ flex: 1 }}
      />
      <button className="btn btn-primary" type="submit" disabled={!name.trim()}>
        Anlegen
      </button>
      {message && <span className="feedback-bad">{message}</span>}
    </form>
  );
}

function TeacherClass({
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
        <strong>{summary.name}</strong>
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
    </div>
  );
}
