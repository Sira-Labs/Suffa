/**
 * Joining a class from an invite link or QR code (story 4.3): sign in if needed (the magic
 * link leads back here), see which class it is, join, and wait for the teacher's approval.
 */
import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { ClassesApi } from '@/services/classes/classesApi';
import { useSyncStore } from '@/state';

export function Join() {
  const { t } = useTranslation('classes');
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
    return <p className="muted">{t('join.noServer')}</p>;
  }

  return (
    <div className="stack">
      <h1>{t('join.title')}</h1>
      {auth.status !== 'signed-in' ? (
        <SignInHere provider={provider} returnTo={`/join/${token}`} />
      ) : result ? (
        <div className="card stack">
          <strong>{result.className}</strong>
          <span className={result.status === 'active' ? 'feedback-good' : undefined}>
            {result.status === 'active' ? t('join.alreadyMember') : t('join.requested')}
          </span>
          <Link to="/classes" className="btn" style={{ alignSelf: 'flex-start' }}>
            {t('join.toMyClasses')}
          </Link>
        </div>
      ) : preview ? (
        <div className="card stack">
          <span>
            <Trans
              t={t}
              i18nKey={preview.teacherName ? 'join.invited' : 'join.invitedNoTeacher'}
              values={{ name: preview.className, teacher: preview.teacherName }}
              components={{ 1: <strong /> }}
            />
          </span>
          <button
            className="btn btn-primary"
            onClick={() => void join()}
            style={{ alignSelf: 'flex-start' }}
          >
            {t('join.join')}
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
  const { t } = useTranslation('classes');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await provider.signInWithEmail(email, returnTo);
    setMessage(r.ok ? t('join.linkSent') : t('join.error', { message: r.error.message }));
  };
  return (
    <form className="card stack" onSubmit={(e) => void submit(e)}>
      <span>{t('join.signInFirst')}</span>
      <div className="row">
        <input
          className="input"
          type="email"
          required
          placeholder={t('join.emailPlaceholder')}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-label={t('join.email')}
          style={{ flex: 1 }}
        />
        <button className="btn btn-primary" type="submit">
          {t('join.sendLink')}
        </button>
      </div>
      {message && <span>{message}</span>}
    </form>
  );
}
