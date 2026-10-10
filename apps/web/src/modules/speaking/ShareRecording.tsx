/**
 * Sharing the recording just made with the class teacher (story 15.4). Opt-in per recording:
 * nothing leaves the device until the learner taps the button. Only shown to learners in a
 * class; classes of minors need the parents' consent first.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Recording } from '@/services/audio';
import type { ShareTarget, SharingApi } from '@/services/sharing/sharingApi';

export function ShareRecording({
  api,
  targets,
  text,
  recording,
  score,
}: {
  api: SharingApi;
  targets: ShareTarget[];
  text: string;
  recording: Recording;
  /** The pronunciation score, when the learner had this recording rated. */
  score: number | null;
}) {
  const { t } = useTranslation('speaking');
  const allowed = targets.filter((target) => target.allowed);
  const [classId, setClassId] = useState(allowed[0]?.classId ?? '');
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'busy' }
    | { kind: 'done'; name: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  if (targets.length === 0) return null;
  if (allowed.length === 0) {
    return (
      <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
        {t('share.needsConsent')}
      </p>
    );
  }
  if (state.kind === 'done') {
    return (
      <p className="feedback-good" role="status" style={{ margin: 0 }}>
        {t('share.shared', { name: state.name })}
      </p>
    );
  }

  const target = allowed.find((a) => a.classId === classId) ?? allowed[0]!;
  const share = async () => {
    setState({ kind: 'busy' });
    const result = await api.share({ classId: target.classId, text, recording, score });
    setState(
      result.ok
        ? { kind: 'done', name: target.name }
        : { kind: 'error', message: result.message }
    );
  };

  return (
    <div className="stack" style={{ alignItems: 'center', gap: '0.4rem' }}>
      <div className="row" style={{ justifyContent: 'center' }}>
        {allowed.length > 1 && (
          <label className="row muted" style={{ gap: '0.35rem' }}>
            {t('share.class')}
            <select value={target.classId} onChange={(e) => setClassId(e.target.value)}>
              {allowed.map((a) => (
                <option key={a.classId} value={a.classId}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="btn"
          disabled={state.kind === 'busy'}
          onClick={() => void share()}
        >
          {state.kind === 'busy'
            ? t('share.busy')
            : allowed.length > 1
              ? t('share.share')
              : t('share.shareWith', { name: target.name })}
        </button>
      </div>
      <span className="muted" style={{ fontSize: '0.8rem' }}>
        {t('share.privacy')}
      </span>
      {state.kind === 'error' && (
        <p className="feedback-warn" role="alert" style={{ margin: 0 }}>
          {state.message}
        </p>
      )}
    </div>
  );
}
