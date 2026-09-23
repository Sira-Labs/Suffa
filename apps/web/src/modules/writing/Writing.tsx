import { useMemo, useState } from 'react';
import { ArabicText, Feedback, RecallInput } from '@/components';
import { content } from '@/content';
import { diffArabic, gradeAnswer, type AnswerVerdict } from '@/services/srs';
import { speakArabic, isTtsSupported } from '@/services/speech';

type Tab = 'diktat' | 'translit' | 'satzbau' | 'uebersetzung';

export function Writing() {
  const [tab, setTab] = useState<Tab>('diktat');
  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Schreiben</h1>
      <div className="row">
        <TabButton active={tab === 'diktat'} onClick={() => setTab('diktat')}>
          Diktat
        </TabButton>
        <TabButton active={tab === 'translit'} onClick={() => setTab('translit')}>
          Transliteration → Schrift
        </TabButton>
        <TabButton active={tab === 'satzbau'} onClick={() => setTab('satzbau')}>
          Satzbau
        </TabButton>
        <TabButton active={tab === 'uebersetzung'} onClick={() => setTab('uebersetzung')}>
          Übersetzung DE→AR
        </TabButton>
      </div>
      {tab === 'diktat' && <Dictation />}
      {tab === 'translit' && <Transliteration />}
      {tab === 'satzbau' && <SentenceBuilder />}
      {tab === 'uebersetzung' && <Translation />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button className={`btn ${active ? 'btn-accent' : ''}`} onClick={onClick}>
      {children}
    </button>
  );
}

/** Dictation: audio (TTS) → typing. Tashkīl-tolerant correction with diff. */
function Dictation() {
  const items = content.vokabeln;
  const [i, setI] = useState(0);
  const [value, setValue] = useState('');
  const [verdict, setVerdict] = useState<AnswerVerdict | null>(null);
  const target = items[i]!;

  const check = () => setVerdict(gradeAnswer(value, target.ar));
  const next = () => {
    setI((x) => (x + 1) % items.length);
    setValue('');
    setVerdict(null);
  };

  return (
    <div className="card stack" style={{ alignItems: 'center' }}>
      <p className="muted">Höre das Wort und schreibe es vollständig vokalisiert.</p>
      <button
        className="btn btn-primary"
        onClick={() => speakArabic(target.ar)}
        disabled={!isTtsSupported()}
      >
        🔊 Vorlesen
      </button>
      {!isTtsSupported() && (
        <span className="muted">
          (Kein TTS – Wort: <ArabicText>{target.ar}</ArabicText>)
        </span>
      )}
      <div style={{ width: '100%' }}>
        <RecallInput
          value={value}
          onChange={setValue}
          onSubmit={check}
          placeholder="Diktat eingeben…"
        />
      </div>
      <div className="row">
        <button className="btn btn-primary" onClick={check}>
          Prüfen
        </button>
        <button className="btn" onClick={next}>
          Nächstes
        </button>
      </div>
      {verdict && (
        <Feedback
          verdict={verdict}
          expected={target.ar}
          diff={diffArabic(value, target.ar)}
          explanation={`${target.de} · Wurzel ${target.wurzel}`}
        />
      )}
    </div>
  );
}

/** Transliteration → script. */
function Transliteration() {
  const items = content.vokabeln;
  const [i, setI] = useState(0);
  const [value, setValue] = useState('');
  const [verdict, setVerdict] = useState<AnswerVerdict | null>(null);
  const target = items[i]!;
  return (
    <div className="card stack" style={{ alignItems: 'center' }}>
      <p className="muted">Schreibe das Wort in arabischer Schrift:</p>
      <strong style={{ fontSize: '1.6rem' }}>{target.tr}</strong>
      <span className="muted">({target.de})</span>
      <div style={{ width: '100%' }}>
        <RecallInput
          value={value}
          onChange={setValue}
          onSubmit={() => setVerdict(gradeAnswer(value, target.ar))}
        />
      </div>
      <div className="row">
        <button
          className="btn btn-primary"
          onClick={() => setVerdict(gradeAnswer(value, target.ar))}
        >
          Prüfen
        </button>
        <button
          className="btn"
          onClick={() => {
            setI((x) => (x + 1) % items.length);
            setValue('');
            setVerdict(null);
          }}
        >
          Nächstes
        </button>
      </div>
      {verdict && (
        <Feedback
          verdict={verdict}
          expected={target.ar}
          diff={diffArabic(value, target.ar)}
        />
      )}
    </div>
  );
}

/** Sentence building via drag & drop (here via click order, mobile-friendly). */
function SentenceBuilder() {
  const sentences = useMemo(
    () =>
      content.dialoge
        .flatMap((d) => d.zeilen)
        .filter((z) => z.ar.split(/\s+/).length >= 3),
    []
  );
  const [idx, setIdx] = useState(0);
  const target = sentences[idx]!;
  const correctWords = useMemo(() => target.ar.split(/\s+/), [target]);
  const [pool, setPool] = useState<string[]>(() => shuffle(correctWords));
  const [built, setBuilt] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);

  const reset = (nextIdx = idx) => {
    const t = sentences[nextIdx]!;
    setPool(shuffle(t.ar.split(/\s+/)));
    setBuilt([]);
    setChecked(false);
    setIdx(nextIdx);
  };

  const isCorrect = built.join(' ') === correctWords.join(' ');

  return (
    <div className="card stack">
      <p className="muted">Bring die Wörter in die richtige Reihenfolge: „{target.de}“</p>
      <div
        className="card arabic"
        style={{ minHeight: 60, background: 'var(--bg-elev-2)', textAlign: 'right' }}
      >
        {built.map((w, i) => (
          <button
            key={`${w}-${i}`}
            className="btn arabic-inline"
            style={{ fontSize: '1.3rem', margin: '0.2rem' }}
            onClick={() => {
              setBuilt((b) => b.filter((_, j) => j !== i));
              setPool((p) => [...p, w]);
            }}
          >
            {w}
          </button>
        ))}
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        {pool.map((w, i) => (
          <button
            key={`${w}-${i}`}
            className="btn arabic-inline"
            style={{ fontSize: '1.3rem' }}
            onClick={() => {
              setPool((p) => p.filter((_, j) => j !== i));
              setBuilt((b) => [...b, w]);
            }}
          >
            {w}
          </button>
        ))}
      </div>
      <div className="row">
        <button
          className="btn btn-primary"
          disabled={pool.length > 0}
          onClick={() => setChecked(true)}
        >
          Prüfen
        </button>
        <button className="btn" onClick={() => reset((idx + 1) % sentences.length)}>
          Nächster Satz
        </button>
        <button className="btn" onClick={() => reset()}>
          Zurücksetzen
        </button>
      </div>
      {checked && (
        <span className={isCorrect ? 'feedback-good' : 'feedback-bad'}>
          {isCorrect ? '✓ Richtig zusammengesetzt!' : `✗ Richtig: ${target.ar}`}
        </span>
      )}
    </div>
  );
}

/** Translation DE → AR (tashkīl-tolerant). */
function Translation() {
  const items = content.dialoge.flatMap((d) => d.zeilen);
  const [i, setI] = useState(0);
  const [value, setValue] = useState('');
  const [verdict, setVerdict] = useState<AnswerVerdict | null>(null);
  const target = items[i]!;
  return (
    <div className="card stack" style={{ alignItems: 'center' }}>
      <p className="muted">Übersetze ins Arabische:</p>
      <strong style={{ fontSize: '1.2rem' }}>{target.de}</strong>
      <div style={{ width: '100%' }}>
        <RecallInput
          value={value}
          onChange={setValue}
          onSubmit={() => setVerdict(gradeAnswer(value, target.ar))}
        />
      </div>
      <div className="row">
        <button
          className="btn btn-primary"
          onClick={() => setVerdict(gradeAnswer(value, target.ar))}
        >
          Prüfen
        </button>
        <button
          className="btn"
          onClick={() => {
            setI((x) => (x + 1) % items.length);
            setValue('');
            setVerdict(null);
          }}
        >
          Nächstes
        </button>
      </div>
      {verdict && (
        <Feedback
          verdict={verdict}
          expected={target.ar}
          diff={diffArabic(value, target.ar)}
          explanation="Mehrere Formulierungen können richtig sein – vergleiche mit der Musterlösung."
        />
      )}
    </div>
  );
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}
