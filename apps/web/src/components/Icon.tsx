/**
 * Stroke icons used across the app (24×24, currentColor). Inline SVG keeps them offline,
 * themeable and crisp; decorative by default (aria-hidden), so give the surrounding
 * control an accessible name.
 */
const PATHS = {
  home: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  cards: 'M7 4h11a2 2 0 0 1 2 2v11M4 8h11a1 1 0 0 1 1 1v11H5a1 1 0 0 1-1-1z',
  roots:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM20 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 19a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM6 7l4 3M18 7l-4 3M12 15v4',
  listen:
    'M3 14v-2a9 9 0 0 1 18 0v2M3 14h5v7H5a2 2 0 0 1-2-2zM21 14h-5v7h3a2 2 0 0 0 2-2z',
  read: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M8 7h7M8 11h7',
  write: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  speak:
    'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  conjugate: 'M4 7h13l-3-3M20 17H7l3 3',
  exam: 'M6 3h9l4 4v14H6zM9 13l2 2 4-4',
  settings:
    'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowLeft: 'M19 12H5M11 6l-6 6 6 6',
  path: 'M5 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM19 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 6h8a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h8',
  flame: 'M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 1 1 2 2 3 4 0-3 0-5 0-8z',
  check: 'M5 12l5 5 9-10',
  close: 'M6 6l12 12M18 6L6 18',
  play: 'M8 5v14l11-7z',
  volume: 'M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z',
  dumbbell: 'M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z',
  award: 'M12 3a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM8.5 14l-1.5 7 5-3 5 3-1.5-7',
  lock: 'M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1zM8 11V7a4 4 0 0 1 8 0v4',
} as const;

export type IconName = keyof typeof PATHS;

/** Icons drawn as filled shapes rather than strokes. */
const FILLED: ReadonlySet<IconName> = new Set(['play']);

export function Icon({
  name,
  size = 22,
  strokeWidth = 1.8,
  label,
}: {
  name: IconName;
  size?: number;
  strokeWidth?: number;
  /** Accessible name; omit for decorative icons next to visible text. */
  label?: string;
}) {
  const filled = FILLED.has(name);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={name === 'more' ? 3.2 : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
