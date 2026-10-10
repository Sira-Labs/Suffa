import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { reportError } from '@/services/errorTracking';

/**
 * Router error page: catches render errors from all pages, reports them to
 * error tracking and offers a restart instead of the default English page.
 */
export function RouteError() {
  const { t } = useTranslation('components');
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    if (!notFound) reportError(error, { source: 'router' });
  }, [error, notFound]);

  return (
    <main role="alert" style={{ padding: '2rem', maxWidth: 560, margin: '0 auto' }}>
      <h1>{notFound ? t('routeError.notFound') : t('routeError.failed')}</h1>
      <p>{notFound ? t('routeError.notFoundText') : t('routeError.failedText')}</p>
      <p style={{ display: 'flex', gap: '0.5rem' }}>
        <a href="/">{t('routeError.home')}</a>
        {!notFound && (
          <button type="button" onClick={() => window.location.reload()}>
            {t('routeError.reload')}
          </button>
        )}
      </p>
    </main>
  );
}
