import { applyTashkilLevel } from '@/components';
import { useSettingsStore } from '@/state';
import { rootSegments } from './family';

/**
 * A word with its root letters coloured, so learners see the root inside every form
 * (مَكْتَبَة: ك ت ب). Follows the learner's tashkīl setting like `ArabicText`.
 */
export function RootWord({
  word,
  root,
  size = 'normal',
}: {
  word: string;
  root: string;
  size?: 'normal' | 'lg' | 'hero';
}) {
  const level = useSettingsStore((s) => s.settings.tashkilLevel);
  const sizeClass = size === 'lg' ? 'arabic-lg' : size === 'hero' ? 'arabic-hero' : '';
  return (
    <span lang="ar" dir="rtl" className={['arabic', sizeClass].filter(Boolean).join(' ')}>
      {rootSegments(word, root).map((s, i) =>
        s.root ? (
          <span key={i} className="root-letter">
            {applyTashkilLevel(s.text, level)}
          </span>
        ) : (
          <span key={i}>{applyTashkilLevel(s.text, level)}</span>
        )
      )}
    </span>
  );
}
