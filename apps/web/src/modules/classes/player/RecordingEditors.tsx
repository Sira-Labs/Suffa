/**
 * Teacher tools on a recording (stories 8.1, 8.2): add a checkpoint at the current moment,
 * remove checkpoints, generate the transcript (when the server and the class allow AI) and
 * correct it line by line.
 */
import { useState } from 'react';
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
    if (!data) return setMessage('Bitte alle Felder ausfüllen.');
    const at = Math.round(currentTime() * 10) / 10;
    const result = await api.addCheckpoint(classId, mediaId, at, data);
    if (!result.ok) return setMessage(result.message);
    setQuestion('');
    setOptions('');
    setAnswer('');
    setMessage(`Checkpoint bei ${clock(at)} angelegt.`);
    onChange();
  };

  return (
    <section className="card stack" aria-labelledby="checkpoint-editor">
      <h2 id="checkpoint-editor" className="eyebrow">
        Checkpoints
      </h2>
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
                  ? `Diktat: ${c.data.answer}`
                  : `Wort: ${c.data.ar} – ${c.data.de}`}
            </span>
            <button
              className="btn btn-small"
              onClick={() =>
                void api.removeCheckpoint(classId, mediaId, c.id).then(() => onChange())
              }
            >
              Entfernen
            </button>
          </li>
        ))}
      </ul>
      <div className="stack">
        <select
          className="input"
          aria-label="Art des Checkpoints"
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
        >
          <option value="mcq">Frage mit Antworten</option>
          <option value="dictation">Diktat</option>
          <option value="vocab_flash">Wortkarte</option>
        </select>
        <input
          className="input"
          aria-label={
            kind === 'vocab_flash'
              ? 'Arabisches Wort'
              : kind === 'mcq'
                ? 'Frage'
                : 'Hinweis (optional)'
          }
          placeholder={
            kind === 'vocab_flash'
              ? 'Arabisches Wort'
              : kind === 'mcq'
                ? 'Frage'
                : 'Hinweis (optional)'
          }
          dir="auto"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
        />
        {kind === 'mcq' && (
          <textarea
            className="input"
            aria-label="Antworten, eine pro Zeile"
            placeholder="Antworten, eine pro Zeile"
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
              ? 'Nummer der richtigen Antwort'
              : kind === 'dictation'
                ? 'Richtige Antwort'
                : 'Bedeutung'
          }
          placeholder={
            kind === 'mcq'
              ? 'Nummer der richtigen Antwort (1, 2, …)'
              : kind === 'dictation'
                ? 'Richtige Antwort (Arabisch)'
                : 'Bedeutung (Deutsch)'
          }
          dir="auto"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
        <button className="btn" onClick={() => void add()}>
          An der aktuellen Stelle einfügen
        </button>
        {message && <span className="muted">{message}</span>}
      </div>
    </section>
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
  const [cues, setCues] = useState<Cue[]>(transcript?.cues ?? []);
  const [message, setMessage] = useState<string | null>(null);
  const busy = transcript?.status === 'queued' || transcript?.status === 'processing';

  const save = async () => {
    const result = await api.saveTranscript(classId, mediaId, cues);
    setMessage(result.ok ? 'Transkript gespeichert.' : result.message);
    if (result.ok) onChange();
  };
  const generate = async () => {
    const result = await api.generateTranscript(classId, mediaId);
    setMessage(result.ok ? 'Transkript wird erstellt …' : result.message);
    if (result.ok) onChange();
  };

  return (
    <section className="card stack" aria-labelledby="transcript-editor">
      <h2 id="transcript-editor" className="eyebrow">
        Transkript bearbeiten
      </h2>
      {busy && <span className="muted">Das Transkript wird gerade erstellt …</span>}
      {transcript?.status === 'failed' && transcript.error && (
        <span className="feedback-bad">{transcript.error}</span>
      )}
      {!canGenerate && !transcript?.cues.length && (
        <span className="muted" style={{ fontSize: '0.9rem' }}>
          Automatische Transkripte sind auf diesem Server noch nicht eingerichtet. Du
          kannst den Text unten selbst eintragen; er erscheint dann beim Abspielen.
        </span>
      )}
      {canGenerate && !busy && (
        <button
          className="btn"
          onClick={() => void generate()}
          style={{ alignSelf: 'flex-start' }}
        >
          {transcript?.cues.length ? 'Neu erstellen (KI)' : 'Automatisch erstellen (KI)'}
        </button>
      )}
      <ol className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {cues.map((cue, i) => (
          <li key={i} className="row" style={{ alignItems: 'flex-start' }}>
            <span className="muted transcript-time">{clock(cue.start)}</span>
            <textarea
              className="input"
              lang="ar"
              dir="rtl"
              rows={2}
              aria-label={`Zeile bei ${clock(cue.start)}`}
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
          Zeile an der aktuellen Stelle
        </button>
        {cues.length > 0 && (
          <button className="btn btn-primary" onClick={() => void save()}>
            Speichern
          </button>
        )}
        {message && <span className="muted">{message}</span>}
      </div>
    </section>
  );
}
