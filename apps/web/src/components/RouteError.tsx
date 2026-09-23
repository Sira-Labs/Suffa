import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { reportError } from '@/services/errorTracking';

/**
 * Fehlerseite des Routers: fängt Render-Fehler aller Seiten ab, meldet sie an das
 * Fehler-Tracking und bietet einen Neustart an, statt der englischen Standardseite.
 */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (!notFound) reportError(error, { source: 'router' });
  }, [error, notFound]);

  return (
    <main role="alert" style={{ padding: '2rem', maxWidth: 560, margin: '0 auto' }}>
      <h1>{notFound ? 'Seite nicht gefunden' : 'Da ist etwas schiefgelaufen'}</h1>
      <p>
        {notFound
          ? 'Diese Seite gibt es nicht.'
          : 'Der Fehler wurde gemeldet. Deine Lernfortschritte sind lokal gespeichert und bleiben erhalten.'}
      </p>
      <p style={{ display: 'flex', gap: '0.5rem' }}>
        <a href="#/">Zur Übersicht</a>
        {!notFound && (
          <button type="button" onClick={() => window.location.reload()}>
            Neu laden
          </button>
        )}
      </p>
    </main>
  );
}
