import { useMemo, useState } from 'react';
import type { UnitPracticeScope } from '@/types';
import { lineId, scopedDialogues } from '@/services/practice';
import { ArabicText } from '@/components';
import { content } from '@/content';
import { useReachedUnits } from '@/modules/units/useReachedUnits';
import { speakArabic, isTtsSupported } from '@/services/speech';
import {
  isRecognitionSupported,
  recognizeOnce,
  type RecognitionResult,
} from '@/services/speech';
import {
  createRecorder,
  EmptyRecordingError,
  isRecordingSupported,
  type ActiveRecorder,
} from '@/services/audio';
import { isIOS, isStandalonePwa } from '@/services/platform';
import { MinimalPairDrill } from './MinimalPairDrill';
import { recognitionHelp, recorderHelp, type HelpContext } from './speechHelp';

type Tab = 'shadowing' | 'phonologie';

/**
 * Speaking practice. With a `scope` (inside a unit) shadowing uses only that unit's (or section's)
 * dialogue lines; a line counts once the learner recorded it or had it scored.
 */
export function Speaking({ scope }: { scope?: UnitPracticeScope } = {}) {
  const [tab, setTab] = useState<Tab>('shadowing');
  const { keep } = useReachedUnits();
  // Outside a unit: the dialogue lines of every unit reached so far.
  const lines = useMemo(
    () =>
      (scope
        ? scopedDialogues(content.dialoge, scope)
        : content.dialoge.filter(keep)
      ).flatMap((d) => d.zeilen.map((z, i) => ({ ...z, id: lineId(d.id, i) }))),
    [scope, keep]
  );
  return (
    <div className="stack">
      {!scope && <h1 style={{ margin: 0 }}>Sprechen (Pushed Output)</h1>}
      <div className="row">
        <button
          className={`btn ${tab === 'shadowing' ? 'btn-accent' : ''}`}
          onClick={() => setTab('shadowing')}
        >
          Shadowing & Aussprache
        </button>
        <button
          className={`btn ${tab === 'phonologie' ? 'btn-accent' : ''}`}
          onClick={() => setTab('phonologie')}
        >
          Phonologie-Drills
        </button>
      </div>
      {tab === 'shadowing' ? (
        lines.length > 0 ? (
          <Shadowing
            lines={lines}
            isPractised={(id) => scope?.isPractised?.(id) ?? false}
            onPractised={(id) => scope?.onPractised(id)}
          />
        ) : (
          <p className="muted">
            Für diese Einheit gibt es noch keine Sätze zum Nachsprechen.
          </p>
        )
      ) : (
        <MinimalPairDrill />
      )}
    </div>
  );
}

interface ShadowLine {
  id: string;
  ar: string;
  de: string;
}

function Shadowing({
  lines,
  isPractised,
  onPractised,
}: {
  lines: ShadowLine[];
  isPractised(lineId: string): boolean;
  onPractised(lineId: string): void;
}) {
  // Continue with the first sentence not done yet (or the first one when all are done).
  const [i, setI] = useState(() =>
    Math.max(
      0,
      lines.findIndex((l) => !isPractised(l.id))
    )
  );
  // Done in this sitting, shown right away (the store catches up asynchronously).
  const [doneNow, setDoneNow] = useState<ReadonlySet<string>>(new Set());
  const [rate, setRate] = useState(0.9);
  // The sentence a recording belongs to is fixed when it starts (navigation is locked too).
  const [recording, setRecording] = useState<{
    recorder: ActiveRecorder;
    lineId: string;
  } | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  // Tied to its sentence: a late answer never shows under another one.
  const [score, setScore] = useState<{
    lineId: string;
    result: RecognitionResult;
  } | null>(null);
  const [scoring, setScoring] = useState(false);
  const [recordHint, setRecordHint] = useState<string | null>(null);
  const [scoreHint, setScoreHint] = useState<string | null>(null);
  const index = i % lines.length;
  const target = lines[index]!;
  const targetDone = doneNow.has(target.id) || isPractised(target.id);
  const markPractised = (id: string) => {
    setDoneNow((prev) => new Set(prev).add(id));
    onPractised(id);
  };
  const go = (step: number) => {
    setI((x) => (x + step + lines.length) % lines.length);
    setScore(null);
    setRecordedUrl(null);
    setRecordHint(null);
    setScoreHint(null);
  };
  const help: HelpContext = { ios: isIOS(), standalone: isStandalonePwa() };

  const startRecording = async () => {
    setRecordHint(null);
    const started = await createRecorder();
    if (!started.ok) {
      setRecordHint(recorderHelp(started.reason, help));
      return;
    }
    setRecording({ recorder: started.recorder, lineId: target.id });
    setRecordedUrl(null);
  };
  const stopRecording = async () => {
    if (!recording) return;
    try {
      const { blob } = await recording.recorder.stop();
      setRecordedUrl(URL.createObjectURL(blob));
      markPractised(recording.lineId);
    } catch (error) {
      if (!(error instanceof EmptyRecordingError)) throw error;
      setRecordHint(recorderHelp('empty', help));
    } finally {
      setRecording(null);
    }
  };

  const scorePronunciation = async () => {
    setScoring(true);
    setScore(null);
    setScoreHint(null);
    // Called directly from the tap: iOS only allows recognition inside the user gesture.
    const outcome = await recognizeOnce({ target: target.ar });
    if (outcome.ok) {
      setScore({ lineId: target.id, result: outcome.result });
      markPractised(target.id);
    } else setScoreHint(recognitionHelp(outcome.reason, help));
    setScoring(false);
  };

  return (
    <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <span className="muted" aria-live="polite">
        Satz {index + 1} von {lines.length}
        {targetDone && <span className="feedback-good"> · ✓ aufgenommen</span>}
      </span>
      <ArabicText size="lg">{target.ar}</ArabicText>
      <span className="muted">{target.de}</span>

      <div className="row" style={{ justifyContent: 'center' }}>
        <button
          className="btn btn-primary"
          onClick={() => speakArabic(target.ar, { rate })}
          disabled={!isTtsSupported()}
        >
          🔊 Vormachen
        </button>
        <label className="row muted" style={{ gap: '0.4rem' }}>
          Tempo
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.1}
            value={rate}
            onChange={(e) => setRate(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="row" style={{ justifyContent: 'center' }}>
        {isRecordingSupported() ? (
          recording ? (
            <button className="btn btn-accent" onClick={() => void stopRecording()}>
              ⏹ Aufnahme stoppen
            </button>
          ) : (
            <button className="btn" onClick={() => void startRecording()}>
              ⏺ Aufnehmen
            </button>
          )
        ) : (
          <span className="muted">{recorderHelp('unsupported', help)}</span>
        )}
        {recordedUrl && <audio controls src={recordedUrl} />}
      </div>
      {recordHint && (
        <p className="feedback-warn" role="alert" style={{ margin: 0 }}>
          {recordHint}
        </p>
      )}

      <div className="row" style={{ justifyContent: 'center' }}>
        {isRecognitionSupported() ? (
          <button
            className="btn btn-primary"
            onClick={() => void scorePronunciation()}
            disabled={scoring}
          >
            {scoring ? 'Höre zu…' : '🎤 Aussprache bewerten'}
          </button>
        ) : (
          <span className="muted">{recognitionHelp('unsupported', help)}</span>
        )}
      </div>
      {scoreHint && (
        <p className="feedback-warn" role="alert" style={{ margin: 0 }}>
          {scoreHint}
        </p>
      )}

      {score?.lineId === target.id && (
        <div className="stack" style={{ alignItems: 'center' }}>
          <span>
            Erkannt: <span className="arabic-inline">{score.result.transcript}</span>
          </span>
          <strong
            className={score.result.similarity > 0.7 ? 'feedback-good' : 'feedback-warn'}
          >
            Ähnlichkeit: {Math.round(score.result.similarity * 100)} %
          </strong>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'center' }}>
        <button
          className="btn"
          onClick={() => go(-1)}
          disabled={lines.length < 2 || recording !== null}
        >
          ← Vorheriger Satz
        </button>
        <button
          className="btn"
          onClick={() => go(1)}
          disabled={lines.length < 2 || recording !== null}
        >
          Nächster Satz →
        </button>
      </div>
    </div>
  );
}
