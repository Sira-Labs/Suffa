import { useMemo, useState } from 'react';
import { ArabicText } from '@/components';
import { wurzelFamilien } from '@/content';
import { speakArabic } from '@/services/speech';

/**
 * Wurzel-/Morphologie-Explorer – das Rückgrat der Retention.
 * Zeigt zu jeder Wurzel die vernetzten Ableitungen (Vokabeln + Verben)
 * und bietet die Übung „Gleiche Wurzel?“.
 */
export function RootExplorer() {
  const families = useMemo(
    () =>
      [...wurzelFamilien.values()].filter((f) => f.vokabeln.length + f.verben.length > 0),
    []
  );
  const [selected, setSelected] = useState(families[0]?.wurzel ?? '');
  const active = wurzelFamilien.get(selected);

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Wurzel-Explorer (الجذر والوزن)</h1>
      <p className="muted">
        Wörter mit derselben Wurzel teilen eine Grundbedeutung. Das Vernetzen über die
        Wurzel ist der stärkste Hebel fürs Langzeitgedächtnis.
      </p>

      <div className="row">
        {families.map((f) => (
          <button
            key={f.wurzel}
            className={`btn arabic-inline ${f.wurzel === selected ? 'btn-accent' : ''}`}
            style={{ fontSize: '1.2rem' }}
            onClick={() => setSelected(f.wurzel)}
          >
            {f.wurzel}
          </button>
        ))}
      </div>

      {active && (
        <div className="card stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <ArabicText size="lg">{active.wurzel}</ArabicText>
            <span className="badge">
              {active.vokabeln.length + active.verben.length} Ableitungen
            </span>
          </div>

          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
          >
            {active.vokabeln.map((v) => (
              <div key={v.id} className="card" style={{ background: 'var(--bg-elev-2)' }}>
                <ArabicText onClick={() => speakArabic(v.ar)}>{v.ar}</ArabicText>
                <div className="muted">{v.de}</div>
                {v.wazn && (
                  <div className="muted">
                    Wazn: <span className="arabic-inline">{v.wazn}</span>
                  </div>
                )}
                {v.plural && (
                  <div className="muted">
                    Pl.: <span className="arabic-inline">{v.plural}</span>
                  </div>
                )}
              </div>
            ))}
            {active.verben.map((verb) => (
              <div
                key={verb.id}
                className="card"
                style={{ background: 'var(--bg-elev-2)' }}
              >
                <ArabicText onClick={() => speakArabic(verb.lemma)}>
                  {verb.lemma}
                </ArabicText>
                <div className="muted">{verb.de}</div>
                <div className="badge">Verb · {verb.wazn}</div>
              </div>
            ))}
          </div>
          {active.verben[0]?.hinweis && (
            <p className="muted" style={{ margin: 0 }}>
              {active.verben[0].hinweis}
            </p>
          )}
        </div>
      )}

      <SameRootDrill />
    </div>
  );
}

/** Übung „Gleiche Wurzel?“ – zwei Wörter, gleiche Wurzel oder nicht. */
function SameRootDrill() {
  const allVocab = useMemo(
    () => [...wurzelFamilien.values()].flatMap((f) => f.vokabeln),
    []
  );
  const [pair, setPair] = useState(() => makePair(allVocab));
  const [result, setResult] = useState<string | null>(null);

  const answer = (saysSame: boolean) => {
    const correct = pair.a.wurzel === pair.b.wurzel;
    setResult(
      saysSame === correct
        ? '✓ Richtig!'
        : `✗ Falsch. ${pair.a.ar} (${pair.a.wurzel}) vs. ${pair.b.ar} (${pair.b.wurzel})`
    );
  };

  return (
    <div className="card stack">
      <strong>Übung: Gleiche Wurzel?</strong>
      <div className="row" style={{ justifyContent: 'center', gap: '2rem' }}>
        <ArabicText size="lg">{pair.a.ar}</ArabicText>
        <span style={{ fontSize: '1.5rem' }}>↔</span>
        <ArabicText size="lg">{pair.b.ar}</ArabicText>
      </div>
      <div className="row" style={{ justifyContent: 'center' }}>
        <button className="btn btn-primary" onClick={() => answer(true)}>
          Gleiche Wurzel
        </button>
        <button className="btn" onClick={() => answer(false)}>
          Andere Wurzel
        </button>
      </div>
      {result && (
        <div className="stack" style={{ alignItems: 'center' }}>
          <span className={result.startsWith('✓') ? 'feedback-good' : 'feedback-bad'}>
            {result}
          </span>
          <button
            className="btn"
            onClick={() => {
              setPair(makePair(allVocab));
              setResult(null);
            }}
          >
            Nächstes Paar
          </button>
        </div>
      )}
    </div>
  );
}

function makePair<T extends { wurzel: string }>(items: T[]): { a: T; b: T } {
  const a = items[Math.floor(Math.random() * items.length)]!;
  // 50% gleiche Wurzel, falls möglich.
  const sameRoot = items.filter((i) => i.wurzel === a.wurzel && i !== a);
  const useSame = Math.random() < 0.5 && sameRoot.length > 0;
  const pool = useSame ? sameRoot : items.filter((i) => i.wurzel !== a.wurzel);
  const b = pool[Math.floor(Math.random() * pool.length)] ?? items[0]!;
  return { a, b };
}
