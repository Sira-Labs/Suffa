/**
 * Picks a colour scheme (story 18.1): one radio per palette with a preview of its colours in
 * the current theme. Used by the teacher for the class and by learners for themselves.
 */
import { PALETTE_IDS, type PaletteId } from '@suffa/engagement';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/state';
import { PALETTES } from '@/theme/palettes';

export function PalettePicker<V extends string>({
  name,
  label,
  value,
  onChange,
  extra,
  disabled = false,
}: {
  name: string;
  label: string;
  value: V | PaletteId;
  onChange: (value: V | PaletteId) => void;
  /** An option before the palettes, e.g. "like my class". */
  extra?: { value: V; label: string; hint: string };
  disabled?: boolean;
}) {
  const { t } = useTranslation('common');
  const mode = useSettingsStore((s) => s.settings.theme);
  // Shows the pick at once; saving it happens after the click (and may come back later).
  const [selected, setSelected] = useState(value);
  useEffect(() => setSelected(value), [value]);
  const pick = (next: V | PaletteId) => {
    setSelected(next);
    onChange(next);
  };
  return (
    <fieldset className="palette-picker" disabled={disabled}>
      <legend>{label}</legend>
      {extra && (
        <label className="palette-option">
          <input
            type="radio"
            name={name}
            checked={selected === extra.value}
            onChange={() => pick(extra.value)}
          />
          <span className="stack" style={{ gap: 0 }}>
            <strong>{extra.label}</strong>
            <span className="muted">{extra.hint}</span>
          </span>
        </label>
      )}
      {PALETTE_IDS.map((id) => {
        const c = PALETTES[id][mode];
        return (
          <label key={id} className="palette-option">
            <input
              type="radio"
              name={name}
              checked={selected === id}
              onChange={() => pick(id)}
            />
            <span className="palette-swatches" aria-hidden="true">
              {[c.bg, c['bg-elev-2'], c.accent, c['accent-fill']].map((colour, i) => (
                <span key={i} style={{ background: colour }} />
              ))}
            </span>
            <span className="stack" style={{ gap: 0 }}>
              <strong>{t(`palettes.${id}.name`)}</strong>
              <span className="muted">{t(`palettes.${id}.hint`)}</span>
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
