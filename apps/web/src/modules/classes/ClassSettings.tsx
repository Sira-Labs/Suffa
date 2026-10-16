/**
 * The class's settings for its teacher (stories 18.1/18.2): the colour scheme learners see,
 * and an overview of when each practice area opens (now, from a unit of the class's course
 * on, or closed until the teacher opens it).
 */
import {
  AREA_IDS,
  courseById,
  DEFAULT_PALETTE,
  ruleFor,
  type AreaId,
  type AreaRule,
  type AreaUnlocks,
  type PaletteId,
} from '@suffa/engagement';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PalettePicker } from '@/components/PalettePicker';
import type { ClassesApi, ClassSummary } from '@/services/classes/classesApi';

type Mode = AreaRule['mode'];

export function ClassSettings({
  api,
  summary,
  onChange,
}: {
  api: ClassesApi;
  summary: ClassSummary;
  onChange: () => Promise<void>;
}) {
  const { t } = useTranslation(['classes', 'nav']);
  const [palette, setPalette] = useState<PaletteId>(summary.palette ?? DEFAULT_PALETTE);
  const [rules, setRules] = useState<Record<AreaId, AreaRule>>(
    () =>
      Object.fromEntries(
        AREA_IDS.map((area) => [area, ruleFor(summary.unlocks, area)])
      ) as Record<AreaId, AreaRule>
  );
  const [drafts, setDrafts] = useState<Partial<Record<AreaId, string>>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const units = courseById(summary.course ?? 'bayna-yadayk').units.length;

  // Saves run one after another, so quick clicks reach the server in the order made.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const save = (patch: { palette?: PaletteId; unlocks?: AreaUnlocks }) => {
    queue.current = queue.current.then(() => send(patch));
    return queue.current;
  };
  const send = async (patch: { palette?: PaletteId; unlocks?: AreaUnlocks }) => {
    const result = await api.updateSettings(summary.id, patch);
    setMessage(
      result.ok
        ? { ok: true, text: t('settings.saved') }
        : { ok: false, text: result.message }
    );
    if (result.ok) await onChange();
  };

  const setMode = (area: AreaId, mode: Mode) =>
    setRules((current) => ({
      ...current,
      [area]:
        mode === 'unit'
          ? { mode, unit: current[area].mode === 'unit' ? current[area].unit : 3 }
          : { mode },
    }));

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      <section className="card stack">
        <PalettePicker
          name="class-palette"
          label={t('settings.palette')}
          value={palette}
          onChange={(next) => {
            setPalette(next);
            void save({ palette: next });
          }}
        />
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          {t('settings.paletteHint')}
        </p>
      </section>

      <section className="card stack" aria-labelledby="unlocks-title">
        <h2 id="unlocks-title" style={{ fontSize: '1.1rem' }}>
          {t('settings.unlocksTitle')}
        </h2>
        <p className="muted" style={{ margin: 0, fontSize: '0.9rem' }}>
          {t('settings.unlocksHint')}
        </p>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t('settings.area')}</th>
              <th scope="col">{t('settings.rule')}</th>
            </tr>
          </thead>
          <tbody>
            {AREA_IDS.map((area) => {
              const rule = rules[area];
              const label = t(`nav:items.${area}.label`);
              return (
                <tr key={area}>
                  <th scope="row">{label}</th>
                  <td>
                    <span className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                      <select
                        aria-label={t('settings.ruleFor', { area: label })}
                        value={rule.mode}
                        onChange={(e) => setMode(area, e.target.value as Mode)}
                      >
                        <option value="open">{t('settings.open')}</option>
                        <option value="unit">{t('settings.fromUnit')}</option>
                        <option value="closed">{t('settings.closed')}</option>
                      </select>
                      {rule.mode === 'unit' && (
                        <input
                          type="number"
                          className="input"
                          style={{ width: '5rem' }}
                          min={1}
                          max={units}
                          aria-label={t('settings.unitFor', { area: label })}
                          value={drafts[area] ?? String(rule.unit)}
                          onChange={(e) => {
                            const text = e.target.value;
                            setDrafts((current) => ({ ...current, [area]: text }));
                            const unit = Number(text);
                            if (Number.isInteger(unit) && unit >= 1 && unit <= units) {
                              setRules((current) => ({
                                ...current,
                                [area]: { mode: 'unit', unit },
                              }));
                            }
                          }}
                          // Typing may pass through empty or out-of-range text; on leaving the
                          // field it shows the last valid unit again.
                          onBlur={() =>
                            setDrafts(({ [area]: _dropped, ...rest }) => rest)
                          }
                        />
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <span className="row" style={{ gap: '0.5rem' }}>
          <button
            className="btn btn-primary"
            onClick={() => void save({ unlocks: rules })}
          >
            {t('settings.save')}
          </button>
          <button
            className="btn"
            onClick={() => {
              setRules(
                Object.fromEntries(
                  AREA_IDS.map((area) => [area, ruleFor(null, area)])
                ) as Record<AreaId, AreaRule>
              );
              setDrafts({});
              // The defaults are not saved yet.
              setMessage(null);
            }}
          >
            {t('settings.reset')}
          </button>
        </span>
        {message && (
          <p className={message.ok ? 'feedback-good' : 'feedback-bad'} role="status">
            {message.text}
          </p>
        )}
      </section>
    </div>
  );
}
