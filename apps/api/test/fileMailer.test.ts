import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileMailer } from '../src/auth/mailer.js';

describe('FileMailer (browser tests)', () => {
  it('keeps the latest link per address in a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'suffa-mail-'));
    const mailer = new FileMailer(join(dir, 'box'));
    await mailer.sendMagicLink('Amina@Example.org', 'https://x/1');
    await mailer.sendMagicLink('amina@example.org', 'https://x/2');
    expect(await readFile(join(dir, 'box', 'amina@example.org.txt'), 'utf8')).toBe(
      'https://x/2'
    );
  });
});
