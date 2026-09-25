/**
 * The printable certificate (story 14.3): an A4 landscape page rendered outside the app's
 * root, visible only while printing. "Drucken" opens the browser's print dialog, where the
 * certificate can also be saved as a PDF — Arabic script and fonts stay exactly as on screen.
 */
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Certificate } from '@/services/classes/classesApi';

const DATE = new Intl.DateTimeFormat('de-DE', { dateStyle: 'long' });

export function CertificateSheet({ certificate }: { certificate: Certificate }) {
  return (
    <article
      className="certificate"
      aria-label={`Zertifikat Einheit ${certificate.unit}`}
    >
      <p className="certificate-brand">
        Suffa <span lang="ar">الصُّفَّة</span>
      </p>
      <h1 className="certificate-title">Urkunde</h1>
      <p className="certificate-lead">Hiermit wird bestätigt, dass</p>
      <p className="certificate-name">
        {certificate.learnerName || 'die Lernende Person'}
      </p>
      <p className="certificate-lead">
        die <strong>Einheit {certificate.unit}</strong> – {certificate.unitTitle} –
        abgeschlossen hat.
      </p>
      <p className="certificate-detail">
        {certificate.mastery} % der Wörter dieser Einheit sind sicher im Gedächtnis.
      </p>
      <footer className="certificate-footer">
        <span>
          {certificate.className}
          {certificate.teacherName ? ` · ${certificate.teacherName}` : ''}
        </span>
        <span>{DATE.format(new Date(certificate.awardedAt))}</span>
        <span className="certificate-id">Nr. {certificate.id.slice(0, 8)}</span>
      </footer>
    </article>
  );
}

/**
 * Printing one certificate: returns the portal element to render and a function that shows
 * the sheet and opens the print dialog. The sheet disappears again after printing.
 */
export function useCertificatePrint(): [React.ReactNode, (c: Certificate) => void] {
  const [current, setCurrent] = useState<Certificate | null>(null);

  useEffect(() => {
    if (!current) return;
    document.body.classList.add('printing-certificate');
    const done = () => setCurrent(null);
    window.addEventListener('afterprint', done);
    // Let the sheet render before the dialog takes its snapshot.
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('printing-certificate');
    };
  }, [current]);

  const print = useCallback((c: Certificate) => setCurrent(c), []);
  const sheet = current
    ? createPortal(
        <div className="certificate-print">
          <CertificateSheet certificate={current} />
        </div>,
        document.body
      )
    : null;
  return [sheet, print];
}
