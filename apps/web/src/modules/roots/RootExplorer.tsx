import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Vokabel } from '@/types';
import { ArabicText } from '@/components';
import { wurzelFamilien } from '@/content';
import { useReachedUnits } from '@/modules/units/useReachedUnits';
import { speakArabic } from '@/services/speech';
import { PATTERNS, patternWords, type FamilyWord, type RootFamily } from './family';
import { RootWheel, WHEEL_SIZE } from './RootWheel';
import { RootWord } from './RootWord';
import { useAllRootFamilies, useRootFamilies } from './useRootFamilies';

/** Root chips shown before the learner searches. */
const CHIPS = 12;

/**
 * Root families (design step 5): the root in the centre with every word built from it, the
 * root letters coloured inside each word, and what its pattern means. Words and grammar are the
 * course's; further derivations and all explanations are our own (ADR-0023).
 */
export function RootExplorer() {
  const families = useRootFamilies();
  const [query, setQuery] = useState('');
  const [rootId, setRootId] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const family = families.find((f) => f.root === rootId) ?? families[0];
  const selected = family?.words.find((w) => w.key === selectedKey) ?? family?.words[0];
  // Examples of a pattern may come from any root; learned ones are shown first.
  const allFamilies = useAllRootFamilies();
  const byPattern = useMemo(() => patternWords(allFamilies), [allFamilies]);
  const drillWords = useLearnedRootWords();

  const chips = useMemo(() => {
    // Root letters match without spaces or dashes; German meanings keep their spaces.
    const text = query.trim().toLowerCase();
    const letters = text.replace(/[\s-]/g, '');
    if (!letters) return families.slice(0, CHIPS);
    return families.filter(
      (f) =>
        f.letters.join('').includes(letters) ||
        f.words.some((w) => w.de.toLowerCase().includes(text))
    );
  }, [families, query]);

  const choose = (f: RootFamily) => {
    setRootId(f.root);
    setSelectedKey(null);
  };

  return (
    <div className="stack">
      <header className="stack" style={{ gap: '0.25rem' }}>
        <span className="eyebrow">Wurzelfamilie</span>
        <h1 style={{ margin: 0 }}>Wurzeln & Muster (الجذر والوزن)</h1>
        <p className="muted" style={{ margin: 0 }}>
          Aus drei Buchstaben entstehen viele Wörter. Die Wurzel trägt die Bedeutung, das
          Muster sagt, was für ein Wort es ist.
        </p>
      </header>

      <label className="stack" style={{ gap: '0.3rem' }}>
        <span className="muted">Wurzel oder Bedeutung suchen</span>
        <input
          className="input"
          type="search"
          value={query}
          placeholder="z. B. كتب oder schreiben"
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="row" role="list" aria-label="Wurzeln">
        {chips.map((f) => (
          <span role="listitem" key={f.root}>
            <button
              type="button"
              className={`btn btn-small arabic-inline ${f.root === family?.root ? 'btn-accent' : ''}`}
              aria-pressed={f.root === family?.root}
              onClick={() => choose(f)}
            >
              {f.letters.join(' ')}
            </button>
          </span>
        ))}
        {chips.length === 0 && <span className="muted">Keine Wurzel gefunden.</span>}
      </div>

      {family && selected && (
        <>
          <RootWheel
            family={family}
            meaning={rootMeaning(family)}
            selected={selected.key}
            onSelect={(w) => setSelectedKey(w.key)}
          />
          <p className="muted root-legend" style={{ margin: 0 }}>
            Durchgezogen: schon gelernt · gestrichelt: noch nicht gelernt
          </p>
          {family.words.length > WHEEL_SIZE && (
            <div className="row" aria-label="Weitere Wörter der Familie">
              {family.words.slice(WHEEL_SIZE).map((w) => (
                <button
                  key={w.key}
                  type="button"
                  className={`btn btn-small ${w.key === selected.key ? 'btn-accent' : ''}`}
                  aria-pressed={w.key === selected.key}
                  onClick={() => setSelectedKey(w.key)}
                >
                  <ArabicText>{w.ar}</ArabicText>
                </button>
              ))}
            </div>
          )}
          <WordCard
            key={selected.key}
            word={selected}
            root={family.root}
            samePattern={byPattern.filter(
              (w) => w.wazn === selected.wazn && w.root !== family.root
            )}
          />
        </>
      )}

      <Link className="btn btn-primary btn-lg" to="/roots/muster">
        Muster-Trainer: Wörter selbst bilden
      </Link>

      <SameRootDrill words={drillWords} />
    </div>
  );
}

/** The root's meaning: its verb, else its first learned word. */
function rootMeaning(family: RootFamily): string {
  const verb = family.words.find((w) => w.source === 'verb');
  return (verb ?? family.words.find((w) => w.learned) ?? family.words[0]!).de;
}

/** The selected word: root letters coloured, its pattern explained, more of the same pattern. */
function WordCard({
  word,
  root,
  samePattern,
}: {
  word: FamilyWord;
  root: string;
  samePattern: (FamilyWord & { root: string })[];
}) {
  const pattern = word.wazn ? PATTERNS.get(word.wazn) : undefined;
  // Learned examples first, at most three.
  const examples = [...samePattern]
    .sort((a, b) => Number(b.learned) - Number(a.learned))
    .slice(0, 3);
  return (
    <section
      className="paper stack"
      aria-label="Gewähltes Wort"
      style={{ gap: '0.6rem' }}
    >
      <div
        className="row"
        style={{ justifyContent: 'space-between', alignItems: 'center' }}
      >
        <button
          type="button"
          className="btn btn-small"
          aria-label={`${word.ar} anhören`}
          onClick={() => speakArabic(word.ar)}
        >
          Anhören
        </button>
        <RootWord word={word.ar} root={root} size="lg" />
      </div>
      <strong>{word.de}</strong>
      <span className="muted">
        {word.source === 'extra'
          ? 'Nicht im Buch – ein weiteres Wort dieser Wurzel.'
          : word.learned
            ? `Gelernt in Einheit ${word.unit}.`
            : `Kommt in Einheit ${word.unit}.`}
      </span>
      {pattern ? (
        <div className="stack" style={{ gap: '0.3rem' }}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="eyebrow">Muster</span>
            <ArabicText size="lg">{pattern.wazn}</ArabicText>
          </div>
          <p style={{ margin: 0 }}>{pattern.de}</p>
          {examples.length > 0 && (
            <p style={{ margin: 0 }}>
              Genauso:{' '}
              {examples.map((e, i) => (
                <span key={e.key}>
                  {i > 0 && ' · '}
                  <RootWord word={e.ar} root={e.root} /> ({e.de})
                </span>
              ))}
            </p>
          )}
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Für dieses Wort ist noch kein Muster erklärt.
        </p>
      )}
    </section>
  );
}

/** Learned course words with a root, for the "same root?" exercise. */
function useLearnedRootWords(): Vokabel[] {
  const { keep } = useReachedUnits();
  return useMemo(
    () => [...wurzelFamilien.values()].flatMap((f) => f.vokabeln.filter(keep)),
    [keep]
  );
}

/** "Gleiche Wurzel?" exercise – two words, same root or not. */
function SameRootDrill({ words: allVocab }: { words: Vokabel[] }) {
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
  // 50% same root, if possible.
  const sameRoot = items.filter((i) => i.wurzel === a.wurzel && i !== a);
  const useSame = Math.random() < 0.5 && sameRoot.length > 0;
  const pool = useSame ? sameRoot : items.filter((i) => i.wurzel !== a.wurzel);
  const b = pool[Math.floor(Math.random() * pool.length)] ?? items[0]!;
  return { a, b };
}
