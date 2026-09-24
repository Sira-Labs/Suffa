/**
 * Joining a class from an invite link or QR code (story 4.3): sign in if needed (the magic
 * link leads back here), see which class it is, join, and wait for the teacher's approval.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { ClassesApi } from '@/services/classes/classesApi';
import { useSyncStore } from '@/state';

export function Join() {
  const { token = '' } = useParams();
  const provider = useSyncStore((s) => s.provider);
  const auth = useSyncStore((s) => s.auth);
  const api = useMemo(() => new ClassesApi(), []);
  const [preview, setPreview] = useState<{
    className: string;
    teacherName: string | null;
  } | null>(null);
  const [result, setResult] = useState<{ className: string; status: string } | null>(
    null
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status !== 'signed-in') return;
    void api
      .preview(token)
      .then((r) => (r.ok ? setPreview(r.value) : setMessage(r.message)));
  }, [api, auth.status, token]);

  const join = async () => {
    const r = await api.join(token);
    if (r.ok) setResult(r.value);
    else setMessage(r.message);
  };

  if (!(provider instanceof ApiSyncProvider)) {
    return (
      <p className="muted">
        Klassen gibt es nur mit Anmeldung – auf diesem Server nicht eingerichtet.
      </p>
    );
  }

  return (
    <div className="stack">
      <h1>Klasse beitreten</h1>
      {auth.status !== 'signed-in' ? (
        <SignInHere provider={provider} returnTo={`/join/${token}`} />
      ) : result ? (
        <div className="card stack">
          <strong>{result.className}</strong>
          <span className={result.status === 'active' ? 'feedback-good' : undefined}>
            {result.status === 'active'
              ? '✓ Du bist schon Mitglied dieser Klasse.'
              : '✓ Anfrage geschickt. Sobald deine Lehrkraft dich freigibt, bist du dabei.'}
          </span>
          <Link to="/classes" className="btn" style={{ alignSelf: 'flex-start' }}>
            Zu meinen Klassen
          </Link>
        </div>
      ) : preview ? (
        <div className="card stack">
          <span>
            Du wurdest in die Klasse <strong>{preview.className}</strong>
            {preview.teacherName && <> von {preview.teacherName}</>} eingeladen.
          </span>
          <button
            className="btn btn-primary"
            onClick={() => void join()}
            style={{ alignSelf: 'flex-start' }}
          >
            Beitreten
          </button>
        </div>
      ) : null}
      {message && <span className="feedback-bad">{message}</span>}
    </div>
  );
}

function SignInHere({
  provider,
  returnTo,
}: {
  provider: ApiSyncProvider;
  returnTo: string;
}) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await provider.signInWithEmail(email, returnTo);
    setMessage(
      r.ok
        ? '✓ Link gesendet. Öffne die E-Mail auf diesem Gerät – der Link bringt dich hierher zurück.'
        : `Fehler: ${r.error.message}`
    );
  };
  return (
    <form className="card stack" onSubmit={(e) => void submit(e)}>
      <span>Melde dich zuerst an – ohne Passwort, mit einem Link per E-Mail.</span>
      <div className="row">
        <input
          className="input"
          type="email"
          required
          placeholder="deine@email.de"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label="E-Mail-Adresse"
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" type="submit">
          Link senden
        </button>
      </div>
      {message && <span>{message}</span>}
    </form>
  );
}
