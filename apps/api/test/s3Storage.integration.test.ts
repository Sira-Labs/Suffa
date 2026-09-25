/**
 * S3ObjectStorage against a real S3 API (moto or RustFS). Run with SUFFA_TEST_S3_ENDPOINT,
 * e.g. `moto_server -p 5055` and SUFFA_TEST_S3_ENDPOINT=http://localhost:5055.
 */
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { S3ObjectStorage } from '../src/storage/s3Storage.js';

const endpoint = process.env.SUFFA_TEST_S3_ENDPOINT;
const settings = {
  endpoint: endpoint ?? 'http://localhost:0',
  region: 'us-east-1',
  accessKeyId: 'test',
  secretAccessKey: 'test',
  buckets: { media: 'suffa-media', uploads: 'suffa-uploads', content: 'suffa-content' },
};
/** What Caddy does: /media/… → the store. */
const viaCaddy = (path: string) => `${endpoint}${path.replace(/^\/media/, '')}`;

describe.skipIf(!endpoint)('S3ObjectStorage', () => {
  const storage = new S3ObjectStorage(settings);

  beforeAll(async () => {
    const client = new S3Client({
      ...settings,
      forcePathStyle: true,
      credentials: settings,
    });
    for (const bucket of Object.values(settings.buckets)) {
      await client
        .send(new CreateBucketCommand({ Bucket: bucket }))
        .catch(() => undefined);
    }
  });

  it('stores, reads, describes and deletes objects', async () => {
    const body = new TextEncoder().encode('marhaban');
    await storage.put('uploads', 'test/hello.txt', body, 'text/plain');
    expect(
      new TextDecoder().decode((await storage.get('uploads', 'test/hello.txt'))!)
    ).toBe('marhaban');
    expect(await storage.head('uploads', 'test/hello.txt')).toEqual({
      size: 8,
      contentType: 'text/plain',
    });
    await storage.delete('uploads', 'test/hello.txt');
    expect(await storage.get('uploads', 'test/hello.txt')).toBeNull();
    expect(await storage.head('uploads', 'test/hello.txt')).toBeNull();
    await expect(storage.put('uploads', '../escape', body, 'text/plain')).rejects.toThrow(
      /unsafe/
    );
  });

  it('streams large objects to and from files', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'suffa-s3-'));
    const source = join(dir, 'in.bin');
    await writeFile(source, new Uint8Array(3 * 1024 * 1024).fill(3));
    await storage.putFile(
      'media',
      'rec/files/in.bin',
      source,
      'application/octet-stream'
    );
    const target = join(dir, 'out.bin');
    await storage.download('media', 'rec/files/in.bin', target);
    expect((await readFile(target)).length).toBe(3 * 1024 * 1024);
    await rm(dir, { recursive: true });
  });

  it('hands out presigned same-origin URLs that work through the proxy', async () => {
    const put = await storage.presignPut('media', 'rec/1/a.txt', 'text/plain');
    expect(put).toMatch(/^\/media\/suffa-media\/rec\/1\/a\.txt\?/);
    const upload = await fetch(viaCaddy(put), {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: 'salam',
    });
    expect(upload.ok).toBe(true);
    const get = await storage.presignGet('media', 'rec/1/a.txt');
    const read = await fetch(viaCaddy(get), { headers: { range: 'bytes=1-3' } });
    expect(read.status).toBe(206);
    expect(await read.text()).toBe('ala');
  });

  it('uploads large files in resumable parts', async () => {
    const key = 'rec/2/original.bin';
    const id = await storage.createMultipartUpload(
      'media',
      key,
      'application/octet-stream'
    );
    const part = new Uint8Array(5 * 1024 * 1024).fill(7); // S3 minimum part size
    const etags: string[] = [];
    for (const n of [1, 2]) {
      const url = await storage.presignUploadPart('media', key, id, n);
      const res = await fetch(viaCaddy(url), {
        method: 'PUT',
        body: n === 1 ? part : 'end',
      });
      etags.push(res.headers.get('etag')!);
    }
    // After a drop, the client asks which parts are there.
    const listed = await storage.listParts('media', key, id);
    expect(listed.map((p) => p.partNumber)).toEqual([1, 2]);
    await storage.completeMultipartUpload('media', key, id, listed.reverse());
    expect((await storage.head('media', key))?.size).toBe(part.length + 3);

    const aborted = await storage.createMultipartUpload('media', 'rec/3/x', 'video/mp4');
    await storage.abortMultipartUpload('media', 'rec/3/x', aborted);
    expect(await storage.head('media', 'rec/3/x')).toBeNull();
  });
});
