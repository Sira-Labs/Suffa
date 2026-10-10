import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useContentStore, useSrsStore } from '@/state';

interface AddVocabFormProps {
  onDone(): void;
}

interface FormState {
  ar: string;
  tr: string;
  de: string;
  wurzel: string;
  wazn: string;
  plural: string;
  einheit: string;
  hinweis: string;
}

const EMPTY: FormState = {
  ar: '',
  tr: '',
  de: '',
  wurzel: '',
  wazn: '',
  plural: '',
  einheit: '1',
  hinweis: '',
};

/**
 * "Add content" form for custom vocabulary. Validates the required fields
 * and automatically creates the SRS cards after saving.
 */
export function AddVocabForm({ onDone }: AddVocabFormProps) {
  const { t } = useTranslation(['vocab', 'common']);
  const add = useContentStore((s) => s.add);
  const ensureSeedCards = useSrsStore((s) => s.ensureSeedCards);
  const loadSrs = useSrsStore((s) => s.load);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const einheit = Number.parseInt(form.einheit, 10);
    if (!form.ar.trim() || !form.de.trim() || !form.wurzel.trim()) {
      setError(t('add.required'));
      return;
    }
    if (Number.isNaN(einheit) || einheit < 1) {
      setError(t('add.unitInvalid'));
      return;
    }
    await add({
      ar: form.ar.trim(),
      tr: form.tr.trim(),
      de: form.de.trim(),
      wurzel: form.wurzel.trim(),
      wazn: form.wazn.trim() || undefined,
      plural: form.plural.trim() || null,
      einheit,
      hinweis: form.hinweis.trim() || undefined,
    });
    await ensureSeedCards();
    await loadSrs();
    setForm(EMPTY);
    onDone();
  };

  return (
    <form className="card stack" onSubmit={submit}>
      <h3 style={{ margin: 0 }}>{t('add.title')}</h3>
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">{t('add.arabic')}</span>
          <input
            className="input arabic-inline"
            dir="rtl"
            value={form.ar}
            onChange={set('ar')}
          />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">{t('add.transliteration')}</span>
          <input className="input" value={form.tr} onChange={set('tr')} />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">{t('add.german')}</span>
          <input className="input" value={form.de} onChange={set('de')} />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">{t('add.root')}</span>
          <input
            className="input arabic-inline"
            dir="rtl"
            value={form.wurzel}
            onChange={set('wurzel')}
          />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">{t('add.wazn')}</span>
          <input
            className="input arabic-inline"
            dir="rtl"
            value={form.wazn}
            onChange={set('wazn')}
          />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">{t('add.plural')}</span>
          <input
            className="input arabic-inline"
            dir="rtl"
            value={form.plural}
            onChange={set('plural')}
          />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">{t('add.unit')}</span>
          <input
            className="input"
            type="number"
            min={1}
            value={form.einheit}
            onChange={set('einheit')}
          />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">{t('add.hint')}</span>
          <input className="input" value={form.hinweis} onChange={set('hinweis')} />
        </label>
      </div>
      {error && (
        <p className="feedback-bad" style={{ margin: 0 }}>
          {error}
        </p>
      )}
      <div className="row">
        <button type="submit" className="btn btn-primary">
          {t('add.submit')}
        </button>
        <button type="button" className="btn" onClick={onDone}>
          {t('common:cancel')}
        </button>
      </div>
    </form>
  );
}
