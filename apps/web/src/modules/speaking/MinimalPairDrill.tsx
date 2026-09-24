import { useMemo, useState } from 'react';
import { ArabicText } from '@/components';
import { content } from '@/content';
import { speakArabic, isTtsSupported } from '@/services/speech';

/**
 * Phonology drill with minimal pairs (ء ع ح خ غ ق ص ض ط ظ ث ذ …):
 * listening discrimination – which of the two words was spoken?
 */
export function MinimalPairDrill() {
  const pairs = content.phonologie_minimalpaare;
  const [idx, setIdx] = useState(0);
  const pair = pairs[idx]!;
  const [playedA, setPlayedA] = useState(true);
  const [result, setResult] = useState<string | null>(null);

  const playRandom = () => {
    const a = Math.random() < 0.5;
    setPlayedA(a);
    setResult(null);
    speakArabic(a ? pair.a : pair.b);
  };

  const choose = (choseA: boolean) => {
    setResult(choseA === playedA ? '✓ Richtig gehört!' : '✗ Daneben – nochmal anhören.');
  };

  const options = useMemo(() => [pair.a, pair.b], [pair]);

  return (
    <div className="card stack" style={{ alignItems: 'center', textAlign: 'center' }}>
      <span className="badge">
        Kontrast: <span className="arabic-inline">{pair.kontrast}</span>
      </span>
      <p className="muted">{pair.de}</p>
      <button
        className="btn btn-primary"
        onClick={playRandom}
        disabled={!isTtsSupported()}
      >
        🔊 Wort abspielen
      </button>
      {!isTtsSupported() && (
        <span className="muted">
          Kein TTS verfügbar – Wörter unten zum Selbstsprechen.
        </span>
      )}
      <div className="row" style={{ justifyContent: 'center' }}>
        {options.map((w, i) => (
          <button
            key={w}
            className="btn arabic-inline"
            style={{ fontSize: '1.5rem' }}
            onClick={() => choose(i === 0)}
          >
            {w}
          </button>
        ))}
      </div>
      {result && (
        <div className="stack" style={{ alignItems: 'center' }}>
          <span className={result.startsWith('✓') ? 'feedback-good' : 'feedback-bad'}>
            {result}
          </span>
          <div className="row">
            <span className="muted">A: </span>
            <ArabicText>{pair.a}</ArabicText>
            <span className="muted">B: </span>
            <ArabicText>{pair.b}</ArabicText>
          </div>
        </div>
      )}
      <button
        className="btn"
        onClick={() => {
          setIdx((x) => (x + 1) % pairs.length);
          setResult(null);
        }}
      >
        Nächstes Paar
      </button>
    </div>
  );
}
