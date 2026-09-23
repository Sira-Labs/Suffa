import type { TashkilLevel } from '@/types';
import { useSettingsStore } from '@/state';

const LABELS: Record<TashkilLevel, string> = {
  full: 'Voll',
  partial: 'Teilweise',
  none: 'Ohne',
};

const ORDER: TashkilLevel[] = ['full', 'partial', 'none'];

/** Schalter für die Tashkīl-Stufe (voll → teilweise → ohne). */
export function TashkilToggle() {
  const level = useSettingsStore((s) => s.settings.tashkilLevel);
  const setLevel = useSettingsStore((s) => s.setTashkilLevel);

  return (
    <div className="row" role="group" aria-label="Tashkīl-Stufe">
      <span className="muted" style={{ fontSize: '0.85rem' }}>
        Tashkīl:
      </span>
      {ORDER.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`btn ${opt === level ? 'btn-accent' : ''}`}
          aria-pressed={opt === level}
          onClick={() => void setLevel(opt)}
        >
          {LABELS[opt]}
        </button>
      ))}
    </div>
  );
}
