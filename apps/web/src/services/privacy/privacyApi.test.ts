import { describe, expect, it, vi } from 'vitest';
import { PrivacyApi } from './privacyApi';

describe('PrivacyApi', () => {
  it('turns the export into a JSON file', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json({ profile: { email: 'a@b.de' } })
    ) as unknown as typeof fetch;
    const result = await new PrivacyApi(fetchImpl).exportFile();
    expect(result.ok && result.name).toMatch(/^suffa-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(result.ok && JSON.parse(result.json)).toEqual({
      profile: { email: 'a@b.de' },
    });
  });

  it('sends the confirmation and explains a mismatch', async () => {
    const calls: RequestInit[] = [];
    const fetchImpl = vi.fn(async (_: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init!);
      return Response.json({ error: 'confirmation_mismatch' }, { status: 400 });
    }) as unknown as typeof fetch;
    const result = await new PrivacyApi(fetchImpl).deleteAccount('x@y.de');
    expect(calls[0]).toMatchObject({
      method: 'DELETE',
      body: JSON.stringify({ confirm: 'x@y.de' }),
    });
    expect(!result.ok && result.message).toMatch(/stimmt nicht/);
  });
});
