/**
 * What the learner shared with the teacher of one class (story 15.4): play it again, read the
 * teacher's comment, withdraw it (the file is deleted).
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArabicText } from '@/components';
import { dateLocale } from '@/i18n/format';
import type { SharedRecording, SharingApi } from '@/services/sharing/sharingApi';

const day = (iso: string) => new Date(iso).toLocaleDateString(dateLocale());

export function MySharedRecordings({
  api,
  classId,
}: {
  api: SharingApi;
  classId: string;
}) {
  const { t } = useTranslation('recordings');
  const [items, setItems] = useState<SharedRecording[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.mine();
    if (result.ok) setItems(result.value.items.filter((i) => i.classId === classId));
    else setMessage(result.message);
  }, [api, classId]);

  useEffect(() => {
    void load();
  }, [load]);

  const withdraw = async (item: SharedRecording) => {
    if (!window.confirm(t('mine.withdrawConfirm'))) return;
    const result = await api.withdraw(item.id);
    setMessage(result.ok ? null : result.message);
    await load();
  };

  if (!items) return message ? <p className="feedback-bad">{message}</p> : null;

  return (
    <section className="stack" aria-labelledby="my-shared-title">
      <h2 id="my-shared-title" className="eyebrow">
        {t('mine.title')}
      </h2>
      {items.length === 0 ? (
        <p className="muted">{t('mine.empty')}</p>
      ) : (
        items.map((item) => (
          <article key={item.id} className="card stack" aria-label={t('mine.item')}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="muted" style={{ fontSize: '0.85rem' }}>
                {day(item.createdAt)}
                {` · ${item.heardAt ? t('mine.heardByTeacher') : t('mine.notHeard')}`}
              </span>
              <button className="btn" onClick={() => void withdraw(item)}>
                {t('mine.withdraw')}
              </button>
            </div>
            <ArabicText>{item.text}</ArabicText>
            <audio controls preload="none" src={item.url} />
            {item.comment && (
              <p className="shared-comment" style={{ margin: 0 }}>
                <strong>{t('mine.teacherComment')}</strong> {item.comment}
              </p>
            )}
          </article>
        ))
      )}
      {message && <p className="feedback-bad">{message}</p>}
    </section>
  );
}
