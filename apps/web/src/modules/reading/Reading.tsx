import { useMemo, useState } from 'react';
import type { Dialog } from '@/types';
import { TashkilToggle } from '@/components';
import { applyTashkilLevel } from '@/components/ArabicText';
import { content } from '@/content';
import { normalizeArabic } from '@/services/srs';
import { speakArabic } from '@/services/speech';
import { useSettingsStore } from '@/state';

// Glossary from all vocabulary: normalised form → meaning.
const glossar = new Map<string, { de: string; tr: string; wurzel: string }>();
for (const v of content.vokabeln) {
  glossar.set(normalizeArabic(v.ar), { de: v.de, tr: v.tr, wurzel: v.wurzel });
}

export function Reading() {
  const dialoge = content.dialoge;
  const [selected, setSelected] = useState<Dialog | undefined>(dialoge[0]);
  const [showTranslation, setShowTranslation] = useState(true);

  return (
    <div className="stack">
      <h1 style={{ margin: 0 }}>Lesen</h1>
      <p className="muted">
        Vokalisierte Texte mit Tap-a-Word-Glosse. Tippe ein Wort an, um Bedeutung und
        Wurzel zu sehen (Comprehensible Input, i+1).
      </p>

      <div className="row" style={{ justifyContent: 'space-between' }}>
        <div className="row">
          {dialoge.map((d) => (
            <button
              key={d.id}
              className={`btn ${d.id === selected?.id ? 'btn-accent' : ''}`}
              onClick={() => setSelected(d)}
            >
              E{d.einheit}·D{d.dialog}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => setShowTranslation((v) => !v)}>
          Übersetzung {showTranslation ? 'aus' : 'ein'}
        </button>
      </div>

      <TashkilToggle />

      {selected && (
        <div className="card stack">
          <h2 className="arabic-inline" style={{ margin: 0 }}>
            {selected.titel}
          </h2>
          {selected.zeilen.map((zeile, i) => (
            <GlossLine
              key={i}
              speaker={zeile.sp}
              arabic={zeile.ar}
              german={zeile.de}
              showTranslation={showTranslation}
            />
          ))}
        </div>
      )}

      {selected && <Comprehension dialog={selected} />}
    </div>
  );
}

function GlossLine({
  speaker,
  arabic,
  german,
  showTranslation,
}: {
  speaker: string;
  arabic: string;
  german: string;
  showTranslation: boolean;
}) {
  const level = useSettingsStore((s) => s.settings.tashkilLevel);
  const [gloss, setGloss] = useState<{ word: string; de: string; wurzel: string } | null>(
    null
  );
  const words = useMemo(() => arabic.split(/\s+/).filter(Boolean), [arabic]);

  return (
    <div className="card" style={{ background: 'var(--bg-elev-2)' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="badge arabic-inline">{speaker}</span>
        <button
          className="btn"
          onClick={() => speakArabic(arabic)}
          aria-label="Zeile anhören"
        >
          🔊
        </button>
      </div>
      <p className="arabic" style={{ margin: '0.5rem 0' }}>
        {words.map((w, i) => {
          const entry = glossar.get(normalizeArabic(w));
          return (
            <span
              key={i}
              onClick={() =>
                entry && setGloss({ word: w, de: entry.de, wurzel: entry.wurzel })
              }
              role={entry ? 'button' : undefined}
              tabIndex={entry ? 0 : undefined}
              style={{
                cursor: entry ? 'pointer' : 'default',
                textDecoration: entry ? 'underline dotted var(--accent)' : 'none',
                margin: '0 0.15rem',
              }}
            >
              {applyTashkilLevel(w, level)}{' '}
            </span>
          );
        })}
      </p>
      {gloss && (
        <p className="muted" style={{ margin: 0 }}>
          <span className="arabic-inline">{gloss.word}</span> → {gloss.de} (Wurzel{' '}
          <span className="arabic-inline">{gloss.wurzel}</span>)
        </p>
      )}
      {showTranslation && (
        <p className="muted" style={{ margin: 0 }}>
          {german}
        </p>
      )}
    </div>
  );
}

/** Simple reading comprehension after the text. */
function Comprehension({ dialog }: { dialog: Dialog }) {
  const firstLine = dialog.zeilen[0];
  const correct = firstLine?.de ?? '';
  const [answer, setAnswer] = useState<string | null>(null);
  const options = useMemo(() => {
    const distractors = content.dialoge
      .flatMap((d) => d.zeilen.map((z) => z.de))
      .filter((de) => de !== correct);
    const picks = [...new Set(distractors)].sort(() => Math.random() - 0.5).slice(0, 2);
    return [correct, ...picks].sort(() => Math.random() - 0.5);
  }, [correct]);

  if (!firstLine) return null;

  return (
    <div className="card stack">
      <strong>Leseverständnis</strong>
      <p>
        Was bedeutet die erste Zeile (
        <span className="arabic-inline">{firstLine.ar}</span>)?
      </p>
      {options.map((opt) => (
        <button
          key={opt}
          className={`btn ${answer ? (opt === correct ? 'btn-accent' : '') : ''}`}
          onClick={() => setAnswer(opt)}
        >
          {opt}
        </button>
      ))}
      {answer && (
        <span className={answer === correct ? 'feedback-good' : 'feedback-bad'}>
          {answer === correct ? '✓ Richtig!' : `✗ Richtig wäre: ${correct}`}
        </span>
      )}
    </div>
  );
}
