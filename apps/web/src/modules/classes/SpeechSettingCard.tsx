/**
 * The teacher decides whether the class's learners may have their recordings rated on the
 * server (story 15.2). On by default, off for classes of minors. Recordings go to an EU speech
 * recogniser only for the rating and are not stored.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SpeechApi } from '@/services/speech';

export function SpeechSettingCard({ api, classId }: { api: SpeechApi; classId: string }) {
  const { t } = useTranslation('classes');
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void api.classSetting(classId).then((result) => {
      if (!alive) return;
      if (result.ok) setEnabled(result.value.serverSpeech);
      else setMessage(result.message);
    });
    return () => {
      alive = false;
    };
  }, [api, classId]);

  const save = async (next: boolean) => {
    setBusy(true);
    try {
      const result = await api.setClassSetting(classId, next);
      if (result.ok) {
        setEnabled(next);
        setMessage(null);
      } else setMessage(result.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card stack" aria-labelledby="speech-setting-title">
      <h2 id="speech-setting-title" className="eyebrow">
        {t('speech.title')}
      </h2>
      {enabled !== null && (
        <label className="row" style={{ justifyContent: 'space-between' }}>
          <span className="stack" style={{ gap: 0 }}>
            <span>{t('speech.label')}</span>
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              {t('speech.hint')}
            </span>
          </span>
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => void save(e.target.checked)}
          />
        </label>
      )}
      {message && <p className="feedback-bad">{message}</p>}
    </section>
  );
}
