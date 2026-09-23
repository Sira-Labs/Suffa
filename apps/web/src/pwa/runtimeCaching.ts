/**
 * Cross-origin URLs the service worker handles as "network only".
 *
 * The publisher's audio (old.arabicforall.net) is deliberately NOT matched: <audio> loads it
 * cross-origin with range requests, and a response forwarded by the service worker (opaque)
 * fails to play ("no supported source"). Unmatched requests go straight to the network and are
 * never cached. Covered by runtimeCaching.test.ts.
 */
export const NETWORK_ONLY_PATTERN = /^https:\/\/(www\.youtube\.com|i\.ytimg\.com)\/.*/i;
