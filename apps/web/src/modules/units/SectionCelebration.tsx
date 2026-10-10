/**
 * "Mā shāʾ Allāh" when a dialogue section of the unit path is finished: full screen, like the
 * stage milestone, with the way on to the next section. It shows once per section and device;
 * sections already done when this was first seen are not celebrated again.
 */
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { arabicNumber, type PathSection } from '@/services/units';

const PARTICLES = 14;
const key = (unit: number) => `suffa.path.celebrated.${unit}`;

function readSeen(unit: number): number[] | null {
  try {
    const raw = localStorage.getItem(key(unit));
    return raw === null ? null : (JSON.parse(raw) as number[]);
  } catch {
    return null;
  }
}

function saveSeen(unit: number, done: number[]): void {
  try {
    localStorage.setItem(key(unit), JSON.stringify(done));
  } catch {
    // Storage blocked: the section may be celebrated again next time, which is harmless.
  }
}

export function SectionCelebration({
  unit,
  sections,
}: {
  unit: number;
  sections: PathSection[];
}) {
  const { t } = useTranslation('units');
  // Newly finished dialogues, shown one after another (lowest first).
  const [queue, setQueue] = useState<number[]>([]);
  const done = sections
    .filter((s) => s.no !== null && s.state === 'done')
    .map((s) => s.no as number);
  const doneKey = done.join(',');

  useEffect(() => {
    const seen = readSeen(unit);
    const now = doneKey ? doneKey.split(',').map(Number) : [];
    // First visit on this device: remember what is done, celebrate only what comes next.
    if (seen === null) {
      saveSeen(unit, now);
      return;
    }
    const fresh = now.filter((no) => !seen.includes(no)).sort((a, b) => a - b);
    if (fresh.length > 0) setQueue((q) => [...q, ...fresh.filter((n) => !q.includes(n))]);
  }, [unit, doneKey]);

  const shown = queue[0] ?? null;
  // Remembered once it is on screen (not before: leaving via "Weiter" drops the queue, and the
  // next dialogue must still be celebrated later). The list only ever grows.
  useEffect(() => {
    if (shown === null) return;
    saveSeen(unit, [...new Set([...(readSeen(unit) ?? []), shown])]);
  }, [unit, shown]);
  const dialog = useRef<HTMLDivElement>(null);
  const before = useRef<Element | null>(null);
  // Focus moves into the dialog while it is open and back where it was afterwards.
  useEffect(() => {
    if (shown === null) return;
    before.current ??= document.activeElement;
    dialog.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [shown]);
  useEffect(
    () => () => {
      (before.current as HTMLElement | null)?.focus?.();
    },
    []
  );

  if (shown === null) return null;
  const next = sections.find((s) => s.state === 'current');
  const nextStation =
    next?.stations.find((s) => s.state === 'current') ?? next?.stations[0];
  const close = () => {
    setQueue((q) => q.slice(1));
    if (queue.length <= 1) {
      (before.current as HTMLElement | null)?.focus?.();
      before.current = null;
    }
  };
  // Keep Tab inside the dialog; Escape closes it.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...(dialog.current?.querySelectorAll<HTMLElement>('a, button') ?? [])];
    if (items.length === 0) return;
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      ref={dialog}
      className="section-celebration"
      onKeyDown={onKeyDown}
      role="dialog"
      aria-modal="true"
      aria-labelledby="section-celebration-title"
    >
      <div className="milestone">
        <div className="milestone-burst" aria-hidden>
          {Array.from({ length: PARTICLES }, (_, i) => (
            <span key={i} style={{ ['--i' as string]: i }} />
          ))}
        </div>
        <div className="milestone-medal" aria-hidden>
          <span className="arabic-display">{arabicNumber(shown)}</span>
        </div>
        <p className="arabic-display section-celebration-arabic" lang="ar" dir="rtl">
          مَا شَاءَ ٱللّٰهُ
        </p>
        <span className="eyebrow milestone-eyebrow">{t('celebration.mashaAllah')}</span>
        <h1 id="section-celebration-title" className="milestone-title">
          {t('celebration.title', { n: shown })}
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          {t('celebration.text', { unit })}
        </p>
        <div className="stack milestone-actions">
          {next && nextStation ? (
            <Link to={nextStation.to} className="btn btn-primary btn-lg" onClick={close}>
              {t('celebration.continueWith', { section: next.label })}
            </Link>
          ) : null}
          <button type="button" className="btn" onClick={close}>
            {t('toPath')}
          </button>
        </div>
      </div>
    </div>
  );
}
