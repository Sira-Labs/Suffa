/**
 * The marked lines of a book page, over its image: the line the author is reading is
 * highlighted, and tapping a line plays the recording from there. The highlight is also told
 * to screen readers (`aria-current`), not by colour alone.
 */
import { useTranslation } from 'react-i18next';
import type { SyncLine } from '@/services/courses/bookSync';

export function boxStyle([x, y, w, h]: SyncLine['box']) {
  return {
    left: `${x * 100}%`,
    top: `${y * 100}%`,
    width: `${w * 100}%`,
    height: `${h * 100}%`,
  } as const;
}

export function LineOverlay({
  lines,
  current,
  onPlay,
}: {
  /** The lines of the page shown. */
  lines: readonly SyncLine[];
  /** The line being read, if it is on this page. */
  current: SyncLine | null;
  onPlay: (line: SyncLine) => void;
}) {
  const { t } = useTranslation('units');
  if (lines.length === 0) return null;
  return (
    <div className="book-lines" role="group" aria-label={t('lessonPage.lines.group')}>
      {lines.map((line, i) => {
        const active = line === current;
        return (
          <button
            key={`${line.start}-${i}`}
            type="button"
            className={active ? 'book-line book-line-current' : 'book-line'}
            style={boxStyle(line.box)}
            aria-current={active ? 'true' : undefined}
            aria-label={t('lessonPage.lines.play', { n: i + 1, total: lines.length })}
            onClick={() => onPlay(line)}
          />
        );
      })}
    </div>
  );
}
