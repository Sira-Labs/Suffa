import { useTranslation } from 'react-i18next';
import type { TashkilLevel } from '@/types';
import { useSettingsStore } from '@/state';

const ORDER: TashkilLevel[] = ['full', 'partial', 'none'];

/** Toggle for the tashkīl level (full → partial → none). */
export function TashkilToggle() {
  const { t } = useTranslation('components');
  const level = useSettingsStore((s) => s.settings.tashkilLevel);
  const setLevel = useSettingsStore((s) => s.setTashkilLevel);

  return (
    <div className="row" role="group" aria-label={t('tashkil.group')}>
      <span className="muted" style={{ fontSize: '0.85rem' }}>
        {t('tashkil.label')}
      </span>
      {ORDER.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`btn ${opt === level ? 'btn-accent' : ''}`}
          aria-pressed={opt === level}
          onClick={() => void setLevel(opt)}
        >
          {t(`tashkil.${opt}`)}
        </button>
      ))}
    </div>
  );
}
