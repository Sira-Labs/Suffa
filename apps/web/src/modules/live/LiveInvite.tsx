/**
 * Opening an invite link to one live session (or its QR code): sign in if needed (the
 * magic link leads back here), see which lesson it is, and take part. A member of the class
 * goes on to the session; anyone else has asked to join the class and waits for the
 * teacher's approval, then comes in through the same link.
 */
import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { SignInHere } from '@/modules/classes/Join';
import { LiveApi, type LiveInvitePreview } from '@/services/live/liveApi';
import { ApiSyncProvider } from '@/services/sync/ApiSyncProvider';
import { useSyncStore } from '@/state';

export function LiveInvite({ api: given }: { api?: LiveApi }) {
  const { t, i18n } = useTranslation(['live', 'classes']);
  const { token = '' } = useParams();
  const navigate = useNavigate();
  const provider = useSyncStore((s) => s.provider);
  const auth = useSyncStore((s) => s.auth);
  const api = useMemo(() => given ?? new LiveApi(), [given]);
  const [preview, setPreview] = useState<LiveInvitePreview | null>(null);
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (auth.status !== 'signed-in') return;
    let active = true;
    void api.previewInvite(token).then((r) => {
      if (!active) return;
      if (r.ok) setPreview(r.value);
      else setMessage(r.message);
    });
    return () => {
      active = false;
    };
  }, [api, auth.status, token]);

  const take = async () => {
    setBusy(true);
    setMessage(null);
    const r = await api.joinInvite(token);
    setBusy(false);
    if (!r.ok) {
      setMessage(r.message);
      return;
    }
    if (r.value.status === 'active') {
      navigate(`/classes/${r.value.classId}/live/${r.value.sessionId}`, {
        replace: true,
      });
    } else {
      setPending(true);
    }
  };

  if (!(provider instanceof ApiSyncProvider)) {
    return <p className="muted">{t('classes:join.noServer')}</p>;
  }

  return (
    <div className="stack">
      <h1>{t('invite.title')}</h1>
      {auth.status !== 'signed-in' ? (
        <SignInHere provider={provider} returnTo={`/live-invite/${token}`} />
      ) : preview ? (
        <div className="card stack">
          <span>
            <Trans
              t={t}
              i18nKey={preview.teacherName ? 'invite.invited' : 'invite.invitedNoTeacher'}
              values={{
                title: preview.title,
                name: preview.className,
                teacher: preview.teacherName,
              }}
              components={{ 1: <strong /> }}
            />
          </span>
          <span className="muted">
            {preview.status === 'live'
              ? t('invite.liveNow')
              : new Date(preview.startsAt).toLocaleString(i18n.language, {
                  dateStyle: 'full',
                  timeStyle: 'short',
                })}
          </span>
          {pending ? (
            <>
              <span role="status">
                {t('invite.pending', { name: preview.className })}
              </span>
              <button
                className="btn"
                disabled={busy}
                onClick={() => void take()}
                style={{ alignSelf: 'flex-start' }}
              >
                {t('invite.tryAgain')}
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void take()}
              style={{ alignSelf: 'flex-start' }}
            >
              {t('invite.take')}
            </button>
          )}
        </div>
      ) : null}
      {message && (
        <span className="feedback-bad" role="alert">
          {message}
        </span>
      )}
    </div>
  );
}
