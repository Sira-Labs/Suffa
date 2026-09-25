/**
 * The learner's unit certificates (story 14.3) on the achievements page, each printable or
 * savable as PDF. Shown only when signed in and at least one certificate exists.
 */
import { useEffect, useMemo, useState } from 'react';
import { useCertificatePrint } from '@/modules/classes/CertificateSheet';
import { ClassesApi, type Certificate } from '@/services/classes/classesApi';
import { useSyncStore } from '@/state';

export function MyCertificates() {
  const signedIn = useSyncStore((s) => s.auth.status === 'signed-in');
  const api = useMemo(() => new ClassesApi(), []);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [sheet, print] = useCertificatePrint();

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    void api.myCertificates().then((result) => {
      if (!cancelled && result.ok) setCertificates(result.value.certificates);
    });
    return () => {
      cancelled = true;
    };
  }, [api, signedIn]);

  if (certificates.length === 0) return null;
  return (
    <section className="stack" aria-labelledby="certificates-title">
      {sheet}
      <h2 id="certificates-title">Zertifikate</h2>
      <ul className="badge-grid">
        {certificates.map((c) => (
          <li key={c.id} className="card stack badge-card badge-card-gold">
            <strong>Einheit {c.unit} abgeschlossen</strong>
            <span className="muted" style={{ fontSize: '0.9rem' }}>
              {c.unitTitle} · {c.mastery} % · {c.className}
            </span>
            <button className="btn btn-small" onClick={() => print(c)}>
              Drucken oder als PDF sichern
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
