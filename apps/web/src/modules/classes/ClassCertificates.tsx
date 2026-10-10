/**
 * Certificates tab of a class (story 14.3): learners who reached 90 % mastery of a unit can
 * be awarded "Unit n complete"; the server checks the mastery again. Awarded certificates can
 * be printed (or saved as PDF) and withdrawn if given by mistake.
 */
import { useCallback, useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { dateLocale } from '@/i18n/format';
import type {
  ClassCertificates as Overview,
  ClassesApi,
} from '@/services/classes/classesApi';
import { useCertificatePrint } from './CertificateSheet';

export function ClassCertificates({
  api,
  classId,
}: {
  api: ClassesApi;
  classId: string;
}) {
  const { t } = useTranslation('classes');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sheet, print] = useCertificatePrint();

  const load = useCallback(async () => {
    const result = await api.certificates(classId);
    if (result.ok) setOverview(result.value);
    else setMessage(result.message);
  }, [api, classId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    try {
      const result = await action();
      setMessage(result.ok ? null : (result.message ?? null));
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (!overview) {
    return <p className="muted">{message ?? t('certificates.loading')}</p>;
  }
  const date = new Intl.DateTimeFormat(dateLocale(), { dateStyle: 'medium' });

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      {sheet}
      {message && <p className="feedback-bad">{message}</p>}
      <section className="card stack" aria-labelledby="eligible-title">
        <h2 id="eligible-title" className="eyebrow">
          {t('certificates.eligibleTitle')}
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          {t('certificates.threshold', { threshold: overview.threshold })}
        </p>
        {overview.eligible.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t('certificates.noneEligible')}
          </p>
        ) : (
          <ul className="feed-list">
            {overview.eligible.map((e) => (
              <li
                key={`${e.userId}-${e.unit}`}
                className="feed-item row"
                style={{ justifyContent: 'space-between' }}
              >
                <span>
                  <Trans
                    t={t}
                    i18nKey="certificates.eligible"
                    values={{
                      name: e.name || t('certificates.noName'),
                      unit: e.unit,
                      title: e.unitTitle,
                      mastery: e.mastery,
                    }}
                    components={{ 1: <strong /> }}
                  />
                </span>
                <button
                  className="btn btn-primary btn-small"
                  disabled={busy}
                  onClick={() =>
                    void act(() => api.awardCertificate(classId, e.userId, e.unit))
                  }
                >
                  {t('certificates.award')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack" aria-labelledby="awarded-title">
        <h2 id="awarded-title" className="eyebrow">
          {t('certificates.awardedTitle')}
        </h2>
        {overview.awarded.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            {t('certificates.noneAwarded')}
          </p>
        ) : (
          <ul className="feed-list">
            {overview.awarded.map((c) => (
              <li
                key={c.id}
                className="feed-item row"
                style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
              >
                <span>
                  <Trans
                    t={t}
                    i18nKey="certificates.awarded"
                    values={{
                      name: c.learnerName || t('certificates.noName'),
                      unit: c.unit,
                      date: date.format(new Date(c.awardedAt)),
                    }}
                    components={{ 1: <strong /> }}
                  />
                </span>
                <span className="row">
                  <button className="btn btn-small" onClick={() => print(c)}>
                    {t('certificates.print')}
                  </button>
                  <button
                    className="btn btn-small"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(t('certificates.revokeConfirm'))) {
                        void act(() => api.revokeCertificate(classId, c.id));
                      }
                    }}
                  >
                    {t('certificates.revoke')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
