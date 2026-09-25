/*
 * Push handling for the service worker (story 6.3), imported by the Workbox-generated
 * worker. Messages come from Suffa's server as JSON: { title, body, url, tag }.
 */
self.addEventListener('push', (event) => {
  let message = { title: 'Suffa', body: '', url: '/', tag: 'suffa' };
  try {
    message = { ...message, ...(event.data ? event.data.json() : {}) };
  } catch (error) {
    // Not JSON: show the text as it is.
    if (!(error instanceof SyntaxError)) throw error;
    message.body = event.data ? event.data.text() : '';
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      tag: message.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: message.url },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Only paths inside the app are opened.
  const path = event.notification.data && event.notification.data.url;
  const url = typeof path === 'string' && /^\/(?!\/)/.test(path) ? path : '/';
  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((windows) => {
        const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
        if (open) {
          open.navigate(url);
          return open.focus();
        }
        return self.clients.openWindow(url);
      })
  );
});
