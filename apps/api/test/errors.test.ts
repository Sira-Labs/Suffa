import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { ErrorEvent } from '@sentry/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createErrorReporter,
  disabledReporter,
  scrubEvent,
} from '../src/observability/errors.js';

describe('scrubEvent', () => {
  it('drops request headers, cookies, query, body and user', () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        url: 'https://suffa.example/api/v1/sync/srs_cards/pull',
        headers: { authorization: 'Bearer secret' },
        cookies: { session: 'x' },
        query_string: 'since=2026',
        data: '{"records":[]}',
      },
      user: { email: 'student@example.com' },
    } as ErrorEvent);
    expect(event.request).toEqual({
      url: 'https://suffa.example/api/v1/sync/srs_cards/pull',
    });
    expect(event.user).toBeUndefined();
  });
});

describe('createErrorReporter', () => {
  it('is a no-op without a DSN', () => {
    const reporter = createErrorReporter({
      dsn: undefined,
      release: 'sha-test',
      environment: 'test',
      role: 'api',
    });
    expect(reporter).toBe(disabledReporter);
    expect(() => reporter.capture(new Error('ignored'))).not.toThrow();
  });
});

/** A fake GlitchTip: records the envelopes it receives. */
describe('createErrorReporter with a DSN', () => {
  const envelopes: { url: string; body: string }[] = [];
  let server: ReturnType<typeof createServer>;
  let dsn: string;

  const readBody = (req: IncomingMessage) =>
    new Promise<string>((resolve) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => resolve(body));
    });

  beforeAll(async () => {
    server = createServer(async (req, res) => {
      envelopes.push({ url: req.url ?? '', body: await readBody(req) });
      res.writeHead(200).end('{}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    dsn = `http://publickey@127.0.0.1:${port}/42`;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it('sends the error with release, environment, role tag and stack trace', async () => {
    const reporter = createErrorReporter({
      dsn,
      release: 'sha-abc1234',
      environment: 'prod',
      role: 'worker',
    });
    reporter.capture(new Error('boom'), { queue: 'maintenance' });
    await reporter.flush(5000);

    expect(envelopes).toHaveLength(1);
    const url = new URL(envelopes[0].url, 'http://glitchtip');
    expect(url.pathname).toBe('/api/42/envelope/');
    expect(url.searchParams.get('sentry_key')).toBe('publickey');
    const [, , item] = envelopes[0].body.split('\n');
    const event = JSON.parse(item);
    expect(event).toMatchObject({
      release: 'sha-abc1234',
      environment: 'prod',
      platform: 'node',
      tags: { role: 'worker' },
      extra: { queue: 'maintenance' },
      sdk: { name: expect.stringContaining('node') },
    });
    const [exception] = event.exception.values;
    expect(exception).toMatchObject({ type: 'Error', value: 'boom' });
    expect(exception.stacktrace.frames.length).toBeGreaterThan(0);
  });
});
