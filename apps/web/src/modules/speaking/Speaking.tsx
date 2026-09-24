import { useMemo, useState } from 'react';
import type { UnitPracticeScope } from '@/types';
import { lineId, scopedDialogues } from '@/services/practice';
import { ArabicText } from '@/components';
import { content } from '@/content';
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
  const lines = useMemo(
    () =>
      (scope ? scopedDialogues(content.dialoge, scope) : content.dialoge).flatMap((d) =>
        d.zeilen.map((z, i) => ({ ...z, id: lineId(d.id, i) }))
      ),
    [scope]
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
          <Shadowing lines={lines} onPractised={(id) => scope?.onPractised(id)} />
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
  onPractised,
}: {
  lines: ShadowLine[];
  onPractised(lineId: string): void;
}) {
  const [i, setI] = useState(0);
  const [rate, setRate] = useState(0.9);
  const [recording, setRecording] = useState<ActiveRecorder | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [score, setScore] = useState<RecognitionResult | null>(null);
  const [scoring, setScoring] = useState(false);
  const [recordHint, setRecordHint] = useState<string | null>(null);
  const [scoreHint, setScoreHint] = useState<string | null>(null);
  const target = lines[i % lines.length]!;
  const help: HelpContext = { ios: isIOS(), standalone: isStandalonePwa() };

  const startRecording = async () => {
    setRecordHint(null);
    const started = await createRecorder();
    if (!started.ok) {
      setRecordHint(recorderHelp(started.reason, help));
      return;
    }
    setRecording(started.recorder);
    setRecordedUrl(null);
  };
  const stopRecording = async () => {
    if (!recording) return;
    try {
      const { blob } = await recording.stop();
      setRecordedUrl(URL.createObjectURL(blob));
      onPractised(target.id);
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
      setScore(outcome.result);
      onPractised(target.id);
    } else setScoreHint(recognitionHelp(outcome.reason, help));
    setScoring(false);
  };

  return (
    <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
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

      {score && (
        <div className="stack" style={{ alignItems: 'center' }}>
          <span>
            Erkannt: <span className="arabic-inline">{score.transcript}</span>
          </span>
          <strong className={score.similarity > 0.7 ? 'feedback-good' : 'feedback-warn'}>
            Ähnlichkeit: {Math.round(score.similarity * 100)} %
          </strong>
        </div>
      )}

      <button
        className="btn"
        onClick={() => {
          setI((x) => (x + 1) % lines.length);
          setScore(null);
          setRecordedUrl(null);
          setRecordHint(null);
          setScoreHint(null);
        }}
      >
        Nächste Zeile
      </button>
    </div>
  );
}
