/**
 * Universal Links (iOS) and App Links (Android) files (ADR-0019): sign-in links and class
 * invitations open the app when it is installed, the website otherwise. Caddy maps
 * /.well-known/{apple-app-site-association,assetlinks.json} here.
 */
import { Hono } from 'hono';

export interface AppLinks {
  iosAppIds: string[];
  android: { packageName: string; fingerprints: string[] } | undefined;
}

/** Paths the app opens: magic-link sign-in and class invitations. */
export const APP_LINK_PATHS = ['/api/v1/auth/magic-link/verify', '/join/*'];

export function createAppLinkRoutes(links: AppLinks): Hono {
  const app = new Hono();

  app.get('/app-links/apple-app-site-association', (c) => {
    if (links.iosAppIds.length === 0) return c.json({ error: 'not_found' }, 404);
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json({
      applinks: {
        details: [
          {
            appIDs: links.iosAppIds,
            components: APP_LINK_PATHS.map((path) => ({ '/': path })),
          },
        ],
      },
    });
  });

  app.get('/app-links/assetlinks.json', (c) => {
    if (!links.android) return c.json({ error: 'not_found' }, 404);
    c.header('Cache-Control', 'public, max-age=3600');
    return c.json([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: links.android.packageName,
          sha256_cert_fingerprints: links.android.fingerprints,
        },
      },
    ]);
  });

  return app;
}
