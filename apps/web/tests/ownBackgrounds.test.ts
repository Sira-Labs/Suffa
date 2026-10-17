import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  LocalOwnBackgrounds,
  MAX_BACKGROUND_FILE_BYTES,
  MAX_OWN_BACKGROUNDS,
  OwnBackgroundError,
} from '@/services/live/ownBackgrounds';
import { AppDatabase } from '@/services/storage';
import {
  isOwnChoice,
  ownChoice,
  rememberedBackground,
} from '@/services/live/backgrounds';

/** Story 18.3: own camera backgrounds, kept on the device. */
describe('own camera backgrounds', () => {
  let database: AppDatabase;
  let ids = 0;
  const fitted: Blob[] = [];
  // jsdom's Blob cannot be read as bytes; browsers' and Node's can.
  const jpeg = (text: string) => new NodeBlob([text], { type: 'image/jpeg' }) as Blob;
  const read = (blob: Blob) =>
    new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
  const store = (fit = async (_file: Blob) => jpeg('fitted')) =>
    new LocalOwnBackgrounds(
      database.live_backgrounds,
      async (file) => {
        fitted.push(file);
        return fit(file);
      },
      () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`
    );
  const picture = (type = 'image/png', bytes = 4) =>
    new File([new Uint8Array(bytes)], 'bild', { type });

  beforeEach(() => {
    database = new AppDatabase(`own-backgrounds-${Math.random()}`);
    ids = 0;
    fitted.length = 0;
  });
  afterEach(async () => {
    await database.delete();
    localStorage.removeItem('suffa.liveBackground');
  });

  it('keeps fitted pictures in the order they were added, and deletes them', async () => {
    const own = store(async () => jpeg('jpeg!'));
    const first = await own.add(picture());
    const second = await own.add(picture('image/webp'));
    const listed = await own.list();
    expect(listed.map((b) => b.id)).toEqual([first.id, second.id]);
    // Stored as the fitted JPEG, not the original.
    expect(listed[0]!.image.type).toBe('image/jpeg');
    expect(await read(listed[0]!.image)).toBe('jpeg!');

    await own.remove(first.id);
    expect((await own.list()).map((b) => b.id)).toEqual([second.id]);
  });

  it('refuses other files, large files and more than six pictures, before decoding', async () => {
    const own = store();
    await expect(own.add(picture('application/pdf'))).rejects.toMatchObject({
      problem: 'type',
    });
    await expect(
      own.add(picture('image/jpeg', MAX_BACKGROUND_FILE_BYTES + 1))
    ).rejects.toMatchObject({ problem: 'size' });
    expect(fitted).toEqual([]);
    for (let i = 0; i < MAX_OWN_BACKGROUNDS; i += 1) await own.add(picture());
    await expect(own.add(picture())).rejects.toMatchObject({ problem: 'full' });
    expect(fitted).toHaveLength(MAX_OWN_BACKGROUNDS);
  });

  it('says a picture is unreadable when the browser cannot decode it', async () => {
    const own = store(async () => {
      throw new Error('InvalidStateError');
    });
    const refused = await own.add(picture()).catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(OwnBackgroundError);
    expect(refused).toMatchObject({ problem: 'unreadable' });
    expect(await own.list()).toEqual([]);
  });

  it('remembers an own picture as own:<id>, and nothing else that looks like one', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(isOwnChoice(ownChoice(id))).toBe(true);
    localStorage.setItem('suffa.liveBackground', ownChoice(id));
    expect(rememberedBackground()).toBe(`own:${id}`);
    localStorage.setItem('suffa.liveBackground', 'own:../../etc');
    expect(rememberedBackground()).toBe('none');
  });
});
