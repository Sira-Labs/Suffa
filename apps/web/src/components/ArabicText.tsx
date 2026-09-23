import type { CSSProperties } from 'react';
import type { TashkilLevel } from '@/types';
import { stripTashkil } from '@/services/srs/tashkil';
import { useSettingsStore } from '@/state';

interface ArabicTextProps {
  children: string;
  /** Überschreibt die globale Tashkīl-Stufe für diese eine Stelle. */
  level?: TashkilLevel;
  size?: 'normal' | 'lg';
  className?: string;
  style?: CSSProperties;
  /** Vorlesen per Klick (TTS) – aktiviert in interaktiven Modulen. */
  onClick?: () => void;
}

const PARTIAL_KEEP = new Set(['ّ']); // Shadda bleibt bei „teilweise“ erhalten.

/**
 * Reduziert Tashkīl gemäß Stufe:
 *  - full: unverändert
 *  - partial: nur Shadda behalten, übrige Harakāt entfernen
 *  - none: alle Harakāt entfernen
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
