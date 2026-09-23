import type { ReviewRating, SrsCard } from '@/types';
import { previewIntervals } from '@/services/srs';

interface RatingButtonsProps {
  card: SrsCard;
  onRate(rating: ReviewRating): void;
  disabled?: boolean;
}

const META: Record<ReviewRating, { label: string; cls: string }> = {
  again: { label: 'Wieder', cls: 'rating-again' },
  hard: { label: 'Schwer', cls: '' },
  good: { label: 'Gut', cls: 'rating-good' },
  easy: { label: 'Leicht', cls: '' },
};

const ORDER: ReviewRating[] = ['again', 'hard', 'good', 'easy'];

function intervalLabel(days: number): string {
  if (days <= 0) return 'jetzt';
  if (days === 1) return '1 Tag';
  if (days < 30) return `${days} Tage`;
  const months = Math.round(days / 30);
  return months <= 1 ? '~1 Monat' : `~${months} Monate`;
}

/** SM-2 rating with an interval preview per button. */
export function RatingButtons({ card, onRate, disabled }: RatingButtonsProps) {
  const preview = previewIntervals(card);
  return (
    <div className="rating-grid" role="group" aria-label="Wie gut wusstest du es?">
      {ORDER.map((r) => (
        <button
          key={r}
          type="button"
          className={`btn rating-button ${META[r].cls}`}
          disabled={disabled}
          onClick={() => onRate(r)}
        >
          <span>{META[r].label}</span>
          <small>{intervalLabel(preview[r])}</small>
        </button>
      ))}
    </div>
  );
}
