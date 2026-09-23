import type { CSSProperties } from 'react';
import type { TashkilLevel } from '@/types';
import { stripTashkil } from '@/services/srs/tashkil';
import { useSettingsStore } from '@/state';

interface ArabicTextProps {
  children: string;
  /** Overrides the global tashkīl level for this one spot. */
  level?: TashkilLevel;
  size?: 'normal' | 'lg';
  className?: string;
  style?: CSSProperties;
  /** Read aloud on click (TTS) – enabled in interactive modules. */
  onClick?: () => void;
}

const PARTIAL_KEEP = new Set(['ّ']); // Shadda is kept at "partial".

/**
 * Reduces tashkīl according to the level:
 *  - full: unchanged
 *  - partial: keep only shadda, remove the other harakāt
 *  - none: remove all harakāt
 */
export function applyTashkilLevel(text: string, level: TashkilLevel): string {
  if (level === 'full') return text;
  if (level === 'none') return stripTashkil(text);
  // partial
  return Array.from(text)
    .filter((ch) => {
      const isDiacritic = /[ؐ-ًؚ-ٰٟۖ-ۭ]/.test(ch);
      return !isDiacritic || PARTIAL_KEEP.has(ch);
    })
    .join('');
}

export function ArabicText({
  children,
  level,
  size = 'normal',
  className,
  style,
  onClick,
}: ArabicTextProps) {
  const globalLevel = useSettingsStore((s) => s.settings.tashkilLevel);
  const effective = level ?? globalLevel;
  const rendered = applyTashkilLevel(children, effective);
  const cls = ['arabic', size === 'lg' ? 'arabic-lg' : '', className]
    .filter(Boolean)
    .join(' ');
  return (
    <span
      lang="ar"
      dir="rtl"
      className={cls}
      style={style}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {rendered}
    </span>
  );
}
