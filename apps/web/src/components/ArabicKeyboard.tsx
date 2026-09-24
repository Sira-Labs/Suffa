import { useState } from 'react';

interface ArabicKeyboardProps {
  onInsert(char: string): void;
  onBackspace(): void;
  onSpace(): void;
}

const LETTER_ROWS: string[][] = [
  ['ض', 'ص', 'ث', 'ق', 'ف', 'غ', 'ع', 'ه', 'خ', 'ح', 'ج'],
  ['ش', 'س', 'ي', 'ب', 'ل', 'ا', 'ت', 'ن', 'م', 'ك', 'ط'],
  ['ئ', 'ء', 'ؤ', 'ر', 'ى', 'ة', 'و', 'ز', 'ظ', 'د', 'ذ'],
];

// Harakāt + hamza variants as a separate row.
const HARAKAT: { char: string; label: string }[] = [
  { char: 'َ', label: 'Fatḥa' },
  { char: 'ُ', label: 'Ḍamma' },
  { char: 'ِ', label: 'Kasra' },
  { char: 'ْ', label: 'Sukūn' },
  { char: 'ّ', label: 'Shadda' },
  { char: 'ً', label: 'Tanwīn Fatḥ' },
  { char: 'ٌ', label: 'Tanwīn Ḍamm' },
  { char: 'ٍ', label: 'Tanwīn Kasr' },
];

const HAMZA: string[] = ['أ', 'إ', 'آ', 'ؤ', 'ئ', 'ء'];

/**
 * Arabic on-screen keyboard including harakāt and hamza variants.
 * Fully operable via keyboard/screen reader (each key is a <button>).
 */
export function ArabicKeyboard({ onInsert, onBackspace, onSpace }: ArabicKeyboardProps) {
  const [showHarakat, setShowHarakat] = useState(true);

  return (
    <div className="card" style={{ padding: '0.6rem' }} aria-label="Arabische Tastatur">
      <div className="stack" style={{ gap: '0.4rem' }}>
        {LETTER_ROWS.map((row, i) => (
          <div
            key={i}
            className="row"
            style={{ justifyContent: 'center', gap: '0.3rem' }}
          >
            {row.map((ch) => (
              <button
                key={ch}
                type="button"
                className="btn arabic-inline"
                style={{ minWidth: '2.2rem', fontSize: '1.3rem', padding: '0.35rem' }}
                onClick={() => onInsert(ch)}
                aria-label={`Buchstabe ${ch}`}
              >
                {ch}
              </button>
            ))}
          </div>
        ))}

        <div className="row" style={{ justifyContent: 'center', gap: '0.3rem' }}>
          {HAMZA.map((ch) => (
            <button
              key={ch}
              type="button"
              className="btn arabic-inline"
              style={{ minWidth: '2.2rem', fontSize: '1.3rem', padding: '0.35rem' }}
              onClick={() => onInsert(ch)}
              aria-label={`Hamza-Variante ${ch}`}
            >
              {ch}
            </button>
          ))}
        </div>

        {showHarakat && (
          <div className="row" style={{ justifyContent: 'center', gap: '0.3rem' }}>
            {HARAKAT.map((h) => (
              <button
                key={h.label}
                type="button"
                className="btn"
                style={{ minWidth: '2.6rem', padding: '0.35rem' }}
                onClick={() => onInsert(h.char)}
                title={h.label}
                aria-label={h.label}
              >
                <span className="arabic-inline" style={{ fontSize: '1.3rem' }}>
                  ـ{h.char}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="row" style={{ justifyContent: 'center', gap: '0.4rem' }}>
          <button type="button" className="btn" onClick={onSpace} style={{ flex: 1 }}>
            Leerzeichen
          </button>
          <button
            type="button"
            className="btn"
            onClick={onBackspace}
            aria-label="Löschen"
          >
            ⌫
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={showHarakat}
            onClick={() => setShowHarakat((v) => !v)}
          >
            Harakāt {showHarakat ? 'aus' : 'ein'}
          </button>
        </div>
      </div>
    </div>
  );
}
