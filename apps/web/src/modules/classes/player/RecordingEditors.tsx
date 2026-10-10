/**
 * Teacher tools on a recording (stories 8.1, 8.2): add a checkpoint at the current moment,
 * remove checkpoints, generate the transcript (when the server and the class allow AI) and
 * correct it line by line.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsibleCard } from '@/components';
import { useCelebrationStore } from '@/state';
import {
  clock,
  type Checkpoint,
  type CheckpointData,
  type Cue,
} from '@/services/media/checkpoints';
import type { InteractiveApi, Transcript } from '@/services/media/interactiveApi';

type Kind = CheckpointData['kind'];

export function CheckpointEditor({
  api,
  classId,
  mediaId,
  checkpoints,
  currentTime,
  onChange,
}: {
  api: InteractiveApi;
  classId: string;
  mediaId: string;
  checkpoints: Checkpoint[];
  currentTime: () => number;
  onChange: () => void;
}) {
  const { t } = useTranslation(['recordings', 'common']);
  const [kind, setKind] = useState<Kind>('mcq');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState('');
  const [answer, setAnswer] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const build = (): CheckpointData | null => {
    if (kind === 'mcq') {
      const list = options
        .split('\n')
        .map((o) => o.trim())
        .filter(Boolean);
      const right = Number(answer) - 1;
      if (!question.trim() || list.length < 2 || !(right >= 0 && right < list.length))
        return null;
      return { kind, question: question.trim(), options: list, answer: right };
    }
    if (kind === 'dictation') {
      return answer.trim()
        ? { kind, prompt: question.trim(), answer: answer.trim() }
        : null;
    }
    return question.trim() && answer.trim()
      ? { kind, ar: question.trim(), de: answer.trim(), contentRef: null }
      : null;
  };

  const add = async () => {
    const data = build();
    if (!data) return setMessage(t('checkpointEditor.fillAll'));
    const at = Math.round(currentTime() * 10) / 10;
    const result = await api.addCheckpoint(classId, mediaId, at, data);
    if (!result.ok) return setMessage(result.message);
    setQuestion('');
    setOptions('');
    setAnswer('');
    setMessage(t('checkpointEditor.added', { time: clock(at) }));
    onChange();
  };
  const questionLabel =
    kind === 'vocab_flash'
      ? t('checkpointEditor.arabicWord')
      : kind === 'mcq'
        ? t('checkpointEditor.question')
        : t('checkpointEditor.hint');

  return (
    <CollapsibleCard
      id="checkpoint-editor"
      title={t('checkpointEditor.title', { count: checkpoints.length })}
      defaultOpen={false}
    >
      <ul className="feed-list">
        {checkpoints.map((c) => (
          <li
            key={c.id}
            className="feed-item row"
            style={{ justifyContent: 'space-between' }}
          >
            <span>
              {clock(c.atSec)} ·{' '}
              {c.data.kind === 'mcq'
                ? c.data.question
                : c.data.kind === 'dictation'
                  ? t('checkpointEditor.dictationItem', { answer: c.data.answer })
                  : t('checkpointEditor.wordItem', { ar: c.data.ar, de: c.data.de })}
            </span>
            <button
              className="btn btn-small"
              onClick={() =>
                void api.removeCheckpoint(classId, mediaId, c.id).then(() => onChange())
              }
            >
              {t('common:remove')}
            </button>
          </li>
        ))}
      </ul>
      <div className="stack">
        <select
          className="input"
          aria-label={t('checkpointEditor.kind')}
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
        >
          <option value="mcq">{t('checkpointEditor.kinds.mcq')}</option>
          <option value="dictation">{t('checkpointEditor.kinds.dictation')}</option>
          <option value="vocab_flash">{t('checkpointEditor.kinds.vocab_flash')}</option>
        </select>
        <input
          className="input"
          aria-label={questionLabel}
          placeholder={questionLabel}
          dir="auto"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {kind === 'mcq' && (
          <textarea
            className="input"
            aria-label={t('checkpointEditor.options')}
            placeholder={t('checkpointEditor.options')}
            rows={3}
            dir="auto"
            value={options}
            onChange={(e) => setOptions(e.target.value)}
          />
        )}
        <input
          className="input"
          aria-label={
            kind === 'mcq'
              ? t('checkpointEditor.answerNumber')
              : kind === 'dictation'
                ? t('checkpointEditor.rightAnswer')
                : t('checkpointEditor.meaning')
          }
          placeholder={
            kind === 'mcq'
              ? t('checkpointEditor.answerNumberPlaceholder')
              : kind === 'dictation'
                ? t('checkpointEditor.rightAnswerPlaceholder')
                : t('checkpointEditor.meaningPlaceholder')
          }
          dir="auto"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
        <button className="btn" onClick={() => void add()}>
          {t('checkpointEditor.insert')}
        </button>
        {message && <span className="muted">{message}</span>}
      </div>
    </CollapsibleCard>
  );
}

const POLL_MS = 5000;
/** Same as the api: a run without news for this long is taken as lost. */
const STALE_TRANSCRIPT_MS = 10 * 60 * 1000;

/** Where an automatic transcript stands: waiting, or how far it has come. */
function TranscriptProgress({ transcript }: { transcript: Transcript }) {
  const { t } = useTranslation('recordings');
  if (transcript.status === 'queued' || transcript.progress == null) {
    return (
      <span className="muted" role="status">
        {t('transcriptEditor.queued')}
      </span>
    );
  }
  return (
    <div className="stack" role="status" style={{ gap: '0.25rem' }}>
      <span className="muted">
        {t('transcriptEditor.progress', { progress: transcript.progress })}
      </span>
      <progress
        max={100}
        value={transcript.progress}
        aria-label={t('transcriptEditor.progressLabel')}
        style={{ width: '100%' }}
      />
    </div>
  );
}

export function TranscriptEditor({
  api,
  classId,
  mediaId,
  transcript,
  canGenerate,
  currentTime,
  onChange,
}: {
  api: InteractiveApi;
  classId: string;
  mediaId: string;
  transcript: Transcript | null;
  canGenerate: boolean;
  currentTime: () => number;
  onChange: () => void;
}) {
  const { t } = useTranslation(['recordings', 'common']);
  const [cues, setCues] = useState<Cue[]>(transcript?.cues ?? []);
  const [message, setMessage] = useState<string | null>(null);
  const busy = transcript?.status === 'queued' || transcript?.status === 'processing';
  // No news from the worker for a while: it was probably restarted; offer to start again.
  const stuck =
    busy && Date.now() - Date.parse(transcript.updatedAt) > STALE_TRANSCRIPT_MS;

  // While it runs, look again every few seconds (the callback sits in a ref so the
  // player's re-renders do not restart the timer).
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  });
  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => changed.current(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [busy]);

  // Saved: fold the editor away and say so briefly.
  const [fold, setFold] = useState(0);
  const celebrate = useCelebrationStore((s) => s.show);
  const save = async () => {
    const result = await api.saveTranscript(classId, mediaId, cues);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setMessage(null);
    setFold((n) => n + 1);
    celebrate({ title: t('transcriptEditor.saved'), xp: 0, big: false });
    onChange();
  };
  const generate = async () => {
    const result = await api.generateTranscript(classId, mediaId);
    setMessage(result.ok ? t('transcriptEditor.creating') : result.message);
    if (result.ok) onChange();
  };

  return (
    <CollapsibleCard
      id="transcript-editor"
      title={t('transcriptEditor.title')}
      foldSignal={fold}
      // Many text fields: folded unless the teacher opens it (or there is nothing yet).
      defaultOpen={!transcript?.cues.length}
      lead={
        <>
          {busy && !stuck && <TranscriptProgress transcript={transcript} />}
          {stuck && <span className="feedback-bad">{t('transcriptEditor.stuck')}</span>}
          {transcript?.status === 'failed' && transcript.error && (
            <span className="feedback-bad">{transcript.error}</span>
          )}
          {!canGenerate && !transcript?.cues.length && (
            <span className="muted" style={{ fontSize: '0.9rem' }}>
              {t('transcriptEditor.notSetUp')}
            </span>
          )}
          {canGenerate && (!busy || stuck) && (
            <button
              className="btn"
              onClick={() => void generate()}
              style={{ alignSelf: 'flex-start' }}
            >
              {transcript?.cues.length
                ? t('transcriptEditor.regenerate')
                : t('transcriptEditor.generate')}
            </button>
          )}
        </>
      }
    >
      <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {cues.map((cue, i) => (
          <li key={i} className="row" style={{ alignItems: 'flex-start' }}>
            <span className="muted transcript-time">{clock(cue.start)}</span>
            <textarea
              className="input"
              lang="ar"
              dir="rtl"
              rows={2}
              aria-label={t('transcriptEditor.line', { time: clock(cue.start) })}
              value={cue.text}
              onChange={(e) =>
                setCues(
                  cues.map((c, j) => (j === i ? { ...c, text: e.target.value } : c))
                )
              }
              style={{ flex: 1 }}
            />
          </li>
        ))}
      </ol>
      <div className="row">
        <button
          className="btn"
          onClick={() => {
            const start = Math.round(currentTime() * 10) / 10;
            setCues(
              [...cues, { start, end: start + 5, text: '' }].sort(
                (a, b) => a.start - b.start
              )
            );
          }}
        >
          {t('transcriptEditor.addLine')}
        </button>
        {cues.length > 0 && (
          <button className="btn btn-primary" onClick={() => void save()}>
            {t('common:save')}
          </button>
        )}
        {message && <span className="muted">{message}</span>}
      </div>
    </CollapsibleCard>
  );
}
