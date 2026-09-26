/**
 * "Mā shāʾ Allāh" when a dialogue section of the unit path is finished: full screen, like the
 * stage milestone, with the way on to the next section. It shows once per section and device;
 * sections already done when this was first seen are not celebrated again.
 */
import { useEffect, useState } from 'react';
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
  const [shown, setShown] = useState<number | null>(null);
  const done = sections
    .filter((s) => s.no !== null && s.state === 'done')
    .map((s) => s.no as number);
  const doneKey = done.join(',');

  useEffect(() => {
    const seen = readSeen(unit);
    const now = doneKey ? doneKey.split(',').map(Number) : [];
    saveSeen(unit, now);
    // First visit on this device: remember what is done, celebrate only what comes next.
    if (seen === null) return;
    const fresh = now.filter((no) => !seen.includes(no));
    if (fresh.length > 0) setShown(Math.max(...fresh));
  }, [unit, doneKey]);

  if (shown === null) return null;
  const next = sections.find((s) => s.state === 'current');
  const nextStation =
    next?.stations.find((s) => s.state === 'current') ?? next?.stations[0];
  const close = () => setShown(null);

  return (
    <div
      className="section-celebration"
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
        <span className="eyebrow milestone-eyebrow">Mā shāʾ Allāh!</span>
        <h1 id="section-celebration-title" className="milestone-title">
          Dialog {shown} geschafft
        </h1>
        <p className="muted" style={{ margin: 0 }}>
          Einheit {unit}: Hören, Lesen, Grammatik, Wörter, Lücken und Schreiben zu diesem
          Dialog sind erledigt.
        </p>
        <div className="stack milestone-actions">
          {next && nextStation ? (
            <Link to={nextStation.to} className="btn btn-primary btn-lg" onClick={close}>
              Weiter mit {next.label}
            </Link>
          ) : null}
          <button type="button" className="btn" onClick={close}>
            Zum Lernpfad
          </button>
        </div>
      </div>
    </div>
  );
}
