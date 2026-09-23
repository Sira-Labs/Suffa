import { useState } from 'react';
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
 * „Inhalt hinzufügen“-Formular für eigene Vokabeln. Validiert die Pflichtfelder
 * und legt nach dem Speichern automatisch die SRS-Karten an.
 */
export function AddVocabForm({ onDone }: AddVocabFormProps) {
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
      setError('Arabisch, Deutsch und Wurzel sind Pflichtfelder.');
      return;
    }
    if (Number.isNaN(einheit) || einheit < 1) {
      setError('Einheit muss eine positive Zahl sein.');
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
      <h3 style={{ margin: 0 }}>Eigene Vokabel hinzufügen</h3>
      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}
      >
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">Arabisch (vokalisiert) *</span>
          <input
            className="input arabic-inline"
            dir="rtl"
            value={form.ar}
            onChange={set('ar')}
          />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">Umschrift</span>
          <input className="input" value={form.tr} onChange={set('tr')} />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">Deutsch *</span>
          <input className="input" value={form.de} onChange={set('de')} />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">Wurzel * (z. B. س-ك-ن)</span>
          <input
            className="input arabic-inline"
            dir="rtl"
            value={form.wurzel}
            onChange={set('wurzel')}
          />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">Wazn</span>
          <input
            className="input arabic-inline"
            dir="rtl"
            value={form.wazn}
            onChange={set('wazn')}
          />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">Plural</span>
          <input
            className="input arabic-inline"
            dir="rtl"
            value={form.plural}
            onChange={set('plural')}
          />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">Einheit</span>
          <input
            className="input"
            type="number"
            min={1}
            value={form.einheit}
            onChange={set('einheit')}
          />
        </label>
        <label className="stack" style={{ gap: '0.25rem' }}>
          <span className="muted">Hinweis / Mnemonik</span>
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
          Speichern & Karten anlegen
        </button>
        <button type="button" className="btn" onClick={onDone}>
          Abbrechen
        </button>
      </div>
    </form>
  );
}
