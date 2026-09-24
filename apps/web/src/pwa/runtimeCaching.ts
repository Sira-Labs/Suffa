/**
 * Cross-origin URLs the service worker handles as "network only".
 *
 * The publisher's audio (old.arabicforall.net) is deliberately NOT matched: <audio> loads it
 * cross-origin with range requests, and a response forwarded by the service worker (opaque)
 * fails to play ("no supported source"). Unmatched requests go straight to the network and are
 * never cached. Covered by runtimeCaching.test.ts.
 *
 * YouTube thumbnails (i.ytimg.com) are not matched either: a request the worker forwards is a
 * fetch() from the worker, which the CSP judges by `connect-src`, not `img-src` – so the
 * thumbnails broke as soon as the worker controlled the page. The browser loads them itself.
 */
export const NETWORK_ONLY_PATTERN = /^https:\/\/www\.youtube\.com\/.*/i;
