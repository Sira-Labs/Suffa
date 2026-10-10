import { useTranslation } from 'react-i18next';
import { ArabicText } from '@/components';
import type { FamilyWord, RootFamily } from './family';

/** Words shown around the root; the rest are listed below the wheel. */
export const WHEEL_SIZE = 8;

/**
 * The root in the centre and its words around it (design "Wurzelfamilie"): learned words are
 * solid, words not learned yet are dashed, the selected one is highlighted and joined to the
 * root. Positions are percentages, so the wheel scales with the screen.
 */
export function RootWheel({
  family,
  meaning,
  selected,
  onSelect,
}: {
  family: RootFamily;
  /** Short meaning of the root, from its first learned word. */
  meaning: string;
  selected: string | null;
  onSelect: (word: FamilyWord) => void;
}) {
  const { t } = useTranslation('roots');
  const around = family.words.slice(0, WHEEL_SIZE);
  const spots = around.map((w, i) => {
    // Start at the top and go clockwise.
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / around.length;
    return { word: w, x: 50 + 36 * Math.cos(angle), y: 50 + 36 * Math.sin(angle) };
  });
  return (
    <div
      className="root-wheel"
      role="group"
      aria-label={t('wheel.root', { letters: family.letters.join(' ') })}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" className="root-wheel-lines">
        <circle cx="50" cy="50" r="36" className="root-wheel-orbit" />
        {spots.map((s) => (
          <line
            key={s.word.key}
            x1="50"
            y1="50"
            x2={s.x}
            y2={s.y}
            className={
              s.word.key === selected ? 'root-wheel-line active' : 'root-wheel-line'
            }
          />
        ))}
      </svg>
      <div className="root-wheel-core">
        <span lang="ar" dir="rtl" className="root-wheel-letters">
          {family.letters.join(' ')}
        </span>
        <span className="root-wheel-meaning">{meaning}</span>
      </div>
      {spots.map((s) => (
        <button
          key={s.word.key}
          type="button"
          className={[
            'root-node',
            s.word.learned ? '' : 'unlearned',
            s.word.key === selected ? 'selected' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ left: `${s.x}%`, top: `${s.y}%` }}
          aria-pressed={s.word.key === selected}
          aria-label={t(s.word.learned ? 'wheel.word' : 'wheel.wordUnlearned', {
            arabic: s.word.ar,
            meaning: s.word.de,
          })}
          onClick={() => onSelect(s.word)}
        >
          <ArabicText>{s.word.ar}</ArabicText>
          <span className="root-node-de">{s.word.de}</span>
        </button>
      ))}
    </div>
  );
}
