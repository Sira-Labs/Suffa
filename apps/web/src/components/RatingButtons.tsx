import { useTranslation } from 'react-i18next';
import type { ReviewRating, SrsCard } from '@/types';
import i18n from '@/i18n';
import { previewIntervals } from '@/services/srs';
import { useSettingsStore } from '@/state/settingsStore';

interface RatingButtonsProps {
  card: SrsCard;
  onRate(rating: ReviewRating): void;
  disabled?: boolean;
}

const CLASS: Record<ReviewRating, string> = {
  again: 'rating-again',
  hard: '',
  good: 'rating-good',
  easy: '',
};

const ORDER: ReviewRating[] = ['again', 'hard', 'good', 'easy'];

function intervalLabel(days: number): string {
  if (days <= 0) return i18n.t('components:rating.now');
  if (days < 30) return i18n.t('components:rating.days', { count: days });
  return i18n.t('components:rating.months', {
    count: Math.max(1, Math.round(days / 30)),
  });
}

/** Rating with an interval preview per button (SM-2 or FSRS, as the learner chose). */
export function RatingButtons({ card, onRate, disabled }: RatingButtonsProps) {
  const { t } = useTranslation('components');
  const algorithm = useSettingsStore((s) => s.settings.srsAlgorithm);
  const preview = previewIntervals(card, new Date(), algorithm);
  return (
    <div className="rating-grid" role="group" aria-label={t('rating.question')}>
      {ORDER.map((r) => (
        <button
          key={r}
          type="button"
          className={`btn rating-button ${CLASS[r]}`}
          disabled={disabled}
          onClick={() => onRate(r)}
        >
          <span>{t(`rating.${r}`)}</span>
          <small>{intervalLabel(preview[r])}</small>
        </button>
      ))}
    </div>
  );
}
