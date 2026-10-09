/**
 * Sharing the recording just made with the class teacher (story 15.4). Opt-in per recording:
 * nothing leaves the device until the learner taps the button. Only shown to learners in a
 * class; classes of minors need the parents' consent first.
 */
import { useState } from 'react';
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
  const allowed = targets.filter((t) => t.allowed);
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
        Aufnahmen mit der Lehrkraft teilen geht in deiner Klasse, sobald das
        Einverständnis deiner Eltern eingetragen ist.
      </p>
    );
  }
  if (state.kind === 'done') {
    return (
      <p className="feedback-good" role="status" style={{ margin: 0 }}>
        ✓ Mit der Lehrkraft von {state.name} geteilt. Unter Klasse kannst du sie jederzeit
        zurückziehen.
      </p>
    );
  }

  const target = allowed.find((t) => t.classId === classId) ?? allowed[0]!;
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
            Klasse
            <select value={target.classId} onChange={(e) => setClassId(e.target.value)}>
              {allowed.map((t) => (
                <option key={t.classId} value={t.classId}>
                  {t.name}
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
            ? 'Teile …'
            : allowed.length > 1
              ? '📤 Mit Lehrkraft teilen'
              : `📤 Mit Lehrkraft von ${target.name} teilen`}
        </button>
      </div>
      <span className="muted" style={{ fontSize: '0.8rem' }}>
        Nur die Lehrkraft der Klasse hört sie; du kannst sie jederzeit zurückziehen.
      </span>
      {state.kind === 'error' && (
        <p className="feedback-warn" role="alert" style={{ margin: 0 }}>
          {state.message}
        </p>
      )}
    </div>
  );
}
