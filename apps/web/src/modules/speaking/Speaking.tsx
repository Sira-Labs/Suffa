import { useState } from 'react';
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
  isRecordingSupported,
  type ActiveRecorder,
} from '@/services/audio';
import { MinimalPairDrill } from './MinimalPairDrill';

type Tab = 'shadowing' | 'phonologie';

export function Speaking() {
  const [tab, setTab] = useState<Tab>('shadowing');
  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Sprechen (Pushed Output)</h1>
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
      {tab === 'shadowing' ? <Shadowing /> : <MinimalPairDrill />}
    </div>
  );
}

function Shadowing() {
  const lines = content.dialoge.flatMap((d) => d.zeilen);
  const [i, setI] = useState(0);
  const [rate, setRate] = useState(0.9);
  const [recording, setRecording] = useState<ActiveRecorder | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [score, setScore] = useState<RecognitionResult | null>(null);
  const [scoring, setScoring] = useState(false);
  const target = lines[i]!;

  const startRecording = async () => {
    const rec = await createRecorder();
    if (!rec) return;
    setRecording(rec);
    setRecordedUrl(null);
  };
  const stopRecording = async () => {
    if (!recording) return;
    const blob = await recording.stop();
    setRecording(null);
    setRecordedUrl(URL.createObjectURL(blob));
  };

  const scorePronunciation = async () => {
    setScoring(true);
    setScore(null);
    const result = await recognizeOnce({ target: target.ar });
    setScore(result);
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
          <span className="muted">Aufnahme nicht verfügbar (kein Mikrofon-Zugriff).</span>
        )}
        {recordedUrl && <audio controls src={recordedUrl} />}
      </div>

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
          <span className="muted">
            Aussprache-Scoring nicht verfügbar – nutze Aufnahme & Vergleich.
          </span>
        )}
      </div>

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
        }}
      >
        Nächste Zeile
      </button>
    </div>
  );
}
