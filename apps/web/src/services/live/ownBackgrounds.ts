/**
 * The person's own camera backgrounds (story 18.3): pictures they add in the live room. They
 * stay on this device (IndexedDB) and never reach our server; the cut-out happens here too, so
 * the others only see the finished camera picture. Each picture is fitted to the camera frame
 * (1280×720, cropped to fill) and kept as a JPEG, whatever was chosen.
 */
import type { Table } from 'dexie';
import { db } from '@/services/storage';

export const MAX_OWN_BACKGROUNDS = 6;
/** Larger files are refused before anything is decoded. */
export const MAX_BACKGROUND_FILE_BYTES = 15 * 1024 * 1024;
export const BACKGROUND_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const BACKGROUND_FRAME = { width: 1280, height: 720 } as const;

/** A picture as stored: bytes rather than a Blob, which not every browser keeps in IndexedDB. */
export interface OwnBackgroundRecord {
  id: string;
  data: ArrayBuffer;
  type: string;
  createdAt: string;
}

export interface OwnBackground {
  id: string;
  image: Blob;
}

export type OwnBackgroundProblem = 'type' | 'size' | 'full' | 'unreadable';

/** A picture that cannot become a background; `problem` says why. */
export class OwnBackgroundError extends Error {
  constructor(
    readonly problem: OwnBackgroundProblem,
    cause?: unknown
  ) {
    super(`own background refused: ${problem}`, { cause });
    this.name = 'OwnBackgroundError';
  }
}

/** Fits a picture to the camera frame; throws when the browser cannot decode it. */
export type FitPicture = (file: Blob) => Promise<Blob>;

/** Crops the picture to fill 16:9 and scales it to the frame, as a JPEG. */
export const fitPicture: FitPicture = async (file) => {
  const bitmap = await createImageBitmap(file);
  try {
    const { width, height } = BACKGROUND_FRAME;
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no 2d canvas');
    const scale = Math.max(width / bitmap.width, height / bitmap.height);
    const drawn = { width: bitmap.width * scale, height: bitmap.height * scale };
    context.drawImage(
      bitmap,
      (width - drawn.width) / 2,
      (height - drawn.height) / 2,
      drawn.width,
      drawn.height
    );
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.85 });
  } finally {
    bitmap.close();
  }
};

export interface OwnBackgroundStore {
  /** Oldest first, as they were added. */
  list(): Promise<OwnBackground[]>;
  /** Checks, fits and keeps a picture; throws OwnBackgroundError. */
  add(file: File): Promise<OwnBackground>;
  remove(id: string): Promise<void>;
}

export class LocalOwnBackgrounds implements OwnBackgroundStore {
  constructor(
    private readonly table: Table<OwnBackgroundRecord, string>,
    private readonly fit: FitPicture = fitPicture,
    private readonly newId: () => string = () => crypto.randomUUID(),
    private readonly now: () => Date = () => new Date()
  ) {}

  async list(): Promise<OwnBackground[]> {
    const records = await this.table.orderBy('createdAt').toArray();
    return records.map((record) => ({
      id: record.id,
      image: new Blob([record.data], { type: record.type }),
    }));
  }

  async add(file: File): Promise<OwnBackground> {
    if (!(BACKGROUND_FILE_TYPES as readonly string[]).includes(file.type)) {
      throw new OwnBackgroundError('type');
    }
    if (file.size > MAX_BACKGROUND_FILE_BYTES) throw new OwnBackgroundError('size');
    if ((await this.table.count()) >= MAX_OWN_BACKGROUNDS) {
      throw new OwnBackgroundError('full');
    }
    let image: Blob;
    try {
      image = await this.fit(file);
    } catch (cause) {
      throw new OwnBackgroundError('unreadable', cause);
    }
    const record: OwnBackgroundRecord = {
      id: this.newId(),
      data: await image.arrayBuffer(),
      type: image.type || 'image/jpeg',
      createdAt: this.now().toISOString(),
    };
    // Counted again where it is written: another tab may have added one meanwhile.
    await this.table.db.transaction('rw', this.table, async () => {
      if ((await this.table.count()) >= MAX_OWN_BACKGROUNDS) {
        throw new OwnBackgroundError('full');
      }
      await this.table.add(record);
    });
    return { id: record.id, image };
  }

  async remove(id: string): Promise<void> {
    await this.table.delete(id);
  }
}

/** The pictures of this device's own database. */
export const deviceBackgrounds = (): OwnBackgroundStore =>
  new LocalOwnBackgrounds(db.live_backgrounds);
