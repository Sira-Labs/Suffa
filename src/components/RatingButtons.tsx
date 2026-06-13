import type { ReviewRating, SrsCard } from '@/types';
import { previewIntervals } from '@/services/srs';

interface RatingButtonsProps {
  card: SrsCard;
  onRate(rating: ReviewRating): void;
  disabled?: boolean;
}

const META: Record<ReviewRating, { label: string; cls: string }> = {
  again: { label: 'Wieder', cls: '' },
  hard: { label: 'Schwer', cls: '' },
  good: { label: 'Gut', cls: 'btn-primary' },
  easy: { label: 'Leicht', cls: 'btn-accent' },
};

const ORDER: ReviewRating[] = ['again', 'hard', 'good', 'easy'];

function intervalLabel(days: number): string {
  if (days <= 0) return 'jetzt';
  if (days === 1) return '1 Tag';
  if (days < 30) return `${days} Tage`;
  const months = Math.round(days / 30);
  return months <= 1 ? '~1 Monat' : `~${months} Monate`;
}

/** SM-2-Bewertung mit Intervall-Vorschau pro Button. */
export function RatingButtons({ card, onRate, disabled }: RatingButtonsProps) {
  const preview = previewIntervals(card);
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      {ORDER.map((r) => (
        <button
          key={r}
          type="button"
          className={`btn ${META[r].cls}`}
          disabled={disabled}
          onClick={() => onRate(r)}
          style={{ flex: 1, flexDirection: 'column', gap: 0 }}
        >
          <span>{META[r].label}</span>
          <small className="muted">{intervalLabel(preview[r])}</small>
        </button>
      ))}
    </div>
  );
}
