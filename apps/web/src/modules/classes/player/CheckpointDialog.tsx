/**
 * A checkpoint while a recording plays (story 8.2): the player pauses, the learner answers,
 * playback continues. A right answer counts as practice (XP, synced); a word can be added to
 * the learner's cards when it is from the book.
 */
import { useState } from 'react';
import { ArabicText } from '@/components';
import { isCorrect, type Checkpoint } from '@/services/media/checkpoints';

export function CheckpointDialog({
  checkpoint,
  onDone,
}: {
  checkpoint: Checkpoint;
  onDone: (correct: boolean) => void;
}) {
  const data = checkpoint.data;
  const [answer, setAnswer] = useState<string | number | null>(null);
  const [checked, setChecked] = useState(false);
  const correct = answer !== null && isCorrect(data, answer);

  return (
    <div
      className="card stack checkpoint-card"
      role="dialog"
      aria-labelledby="checkpoint-title"
    >
      <h2 id="checkpoint-title" className="eyebrow">
        {data.kind === 'mcq'
          ? 'Frage zur Stelle'
          : data.kind === 'dictation'
            ? 'Diktat: schreib, was du gehört hast'
            : 'Neues Wort'}
      </h2>
      {data.kind === 'mcq' && (
        <>
          <strong>{data.question}</strong>
          <div className="stack" role="radiogroup" aria-label="Antworten">
            {data.options.map((option, i) => (
              <label key={i} className="row">
                <input
                  type="radio"
                  name="checkpoint-answer"
                  disabled={checked}
                  checked={answer === i}
                  onChange={() => setAnswer(i)}
                />
                <span dir="auto">{option}</span>
              </label>
            ))}
          </div>
        </>
      )}
      {data.kind === 'dictation' && (
        <>
          {data.prompt && <span>{data.prompt}</span>}
          <input
            className="input"
            lang="ar"
            dir="rtl"
            aria-label="Deine Antwort"
            disabled={checked}
            value={typeof answer === 'string' ? answer : ''}
            onChange={(e) => setAnswer(e.target.value)}
          />
        </>
      )}
      {data.kind === 'vocab_flash' && (
        <>
          <ArabicText size="hero">{data.ar}</ArabicText>
          <strong>{data.de}</strong>
        </>
      )}
      {checked && data.kind !== 'vocab_flash' && (
        <p className={correct ? 'feedback-good' : 'feedback-bad'} style={{ margin: 0 }}>
          {correct
            ? 'Richtig!'
            : data.kind === 'mcq'
              ? `Richtig wäre: ${data.options[data.answer]}`
              : `Richtig wäre: ${data.answer}`}
        </p>
      )}
      <div className="row">
        {data.kind === 'vocab_flash' ? (
          <button className="btn btn-primary" onClick={() => onDone(true)}>
            Weiter
          </button>
        ) : checked ? (
          <button className="btn btn-primary" onClick={() => onDone(correct)}>
            Weiter
          </button>
        ) : (
          <button
            className="btn btn-primary"
            disabled={answer === null || answer === ''}
            onClick={() => setChecked(true)}
          >
            Prüfen
          </button>
        )}
      </div>
    </div>
  );
}
