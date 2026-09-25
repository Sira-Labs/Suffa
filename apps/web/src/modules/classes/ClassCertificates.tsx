/**
 * Certificates tab of a class (story 14.3): learners who reached 90 % mastery of a unit can
 * be awarded "Unit n complete"; the server checks the mastery again. Awarded certificates can
 * be printed (or saved as PDF) and withdrawn if given by mistake.
 */
import { useCallback, useEffect, useState } from 'react';
import type {
  ClassCertificates as Overview,
  ClassesApi,
} from '@/services/classes/classesApi';
import { useCertificatePrint } from './CertificateSheet';

const DATE = new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' });

export function ClassCertificates({
  api,
  classId,
}: {
  api: ClassesApi;
  classId: string;
}) {
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

  if (!overview) return <p className="muted">{message ?? 'Lade Zertifikate …'}</p>;

  return (
    <div className="stack" style={{ gap: '1rem' }}>
      {sheet}
      {message && <p className="feedback-bad">{message}</p>}
      <section className="card stack" aria-labelledby="eligible-title">
        <h2 id="eligible-title" className="eyebrow">
          Bereit für ein Zertifikat
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Ab {overview.threshold} % Meisterschaft einer Einheit – also so viele ihrer
          Wörter sicher im Gedächtnis.
        </p>
        {overview.eligible.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Gerade ist niemand so weit. Das Klassen-Dashboard zeigt, wer nah dran ist.
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
                  <strong>{e.name || 'Ohne Namen'}</strong> · Einheit {e.unit} (
                  {e.unitTitle}) · {e.mastery} %
                </span>
                <button
                  className="btn btn-primary btn-small"
                  disabled={busy}
                  onClick={() =>
                    void act(() => api.awardCertificate(classId, e.userId, e.unit))
                  }
                >
                  Vergeben
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card stack" aria-labelledby="awarded-title">
        <h2 id="awarded-title" className="eyebrow">
          Vergebene Zertifikate
        </h2>
        {overview.awarded.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Noch keine.
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
                  <strong>{c.learnerName || 'Ohne Namen'}</strong> · Einheit {c.unit} ·{' '}
                  {DATE.format(new Date(c.awardedAt))}
                </span>
                <span className="row">
                  <button className="btn btn-small" onClick={() => print(c)}>
                    Drucken
                  </button>
                  <button
                    className="btn btn-small"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm('Dieses Zertifikat wirklich zurücknehmen?')) {
                        void act(() => api.revokeCertificate(classId, c.id));
                      }
                    }}
                  >
                    Zurücknehmen
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
