/** Recordings of a class (Sprint 7): rows in media_items, files in object storage. */
import type pg from 'pg';

export type MediaStatus = 'uploading' | 'importing' | 'processing' | 'ready' | 'failed';

export interface MediaItem {
  id: string;
  classId: string;
  title: string;
  source: 'upload' | 'drive';
  status: MediaStatus;
  originalKey: string;
  originalName: string | null;
  originalSize: number;
  contentType: string;
  uploadId: string | null;
  driveFileId: string | null;
  durationSec: number | null;
  hasVideo: boolean | null;
  renditions: { audio?: string; video?: string };
  progress: number;
  error: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface NewMediaItem {
  id: string;
  classId: string;
  createdBy: string;
  title: string;
  source: 'upload' | 'drive';
  status: MediaStatus;
  originalKey: string;
  originalName: string | null;
  originalSize: number;
  contentType: string;
  uploadId: string | null;
  driveFileId: string | null;
}

export interface MediaRepository {
  create(item: NewMediaItem): Promise<MediaItem>;
  get(classId: string, id: string): Promise<MediaItem | null>;
  byId(id: string): Promise<MediaItem | null>;
  list(classId: string, publishedOnly: boolean): Promise<MediaItem[]>;
  /** Bytes of originals stored for a class (for the per-class cap). */
  classBytes(classId: string): Promise<number>;
  update(
    id: string,
    change: Partial<
      Pick<
        MediaItem,
        | 'status'
        | 'uploadId'
        | 'durationSec'
        | 'hasVideo'
        | 'renditions'
        | 'progress'
        | 'error'
        | 'originalSize'
      >
    >
  ): Promise<void>;
  publish(id: string, userId: string): Promise<void>;
  remove(id: string): Promise<void>;
}

const COLUMNS: Record<string, string> = {
  status: 'status',
  uploadId: 'upload_id',
  durationSec: 'duration_sec',
  hasVideo: 'has_video',
  renditions: 'renditions',
  progress: 'progress',
  error: 'error',
  originalSize: 'original_size',
};

function toItem(r: Record<string, unknown>): MediaItem {
  return {
    id: r.id as string,
    classId: r.class_id as string,
    title: r.title as string,
    source: r.source as MediaItem['source'],
    status: r.status as MediaStatus,
    originalKey: r.original_key as string,
    originalName: (r.original_name as string | null) ?? null,
    originalSize: Number(r.original_size),
    contentType: r.content_type as string,
    uploadId: (r.upload_id as string | null) ?? null,
    driveFileId: (r.drive_file_id as string | null) ?? null,
    durationSec: (r.duration_sec as number | null) ?? null,
    hasVideo: (r.has_video as boolean | null) ?? null,
    renditions: (r.renditions as MediaItem['renditions']) ?? {},
    progress: r.progress as number,
    error: (r.error as string | null) ?? null,
    publishedAt: r.published_at ? (r.published_at as Date).toISOString() : null,
    createdAt: (r.created_at as Date).toISOString(),
  };
}

export class PgMediaRepository implements MediaRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(item: NewMediaItem) {
    const { rows } = await this.pool.query(
      `insert into media_items (id, class_id, created_by, title, source, status, original_key,
                                original_name, original_size, content_type, upload_id, drive_file_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
      [
        item.id,
        item.classId,
        item.createdBy,
        item.title,
        item.source,
        item.status,
        item.originalKey,
        item.originalName,
        item.originalSize,
        item.contentType,
        item.uploadId,
        item.driveFileId,
      ]
    );
    return toItem(rows[0]);
  }

  async get(classId: string, id: string) {
    const { rows } = await this.pool.query(
      'select * from media_items where class_id = $1 and id = $2',
      [classId, id]
    );
    return rows[0] ? toItem(rows[0]) : null;
  }

  async byId(id: string) {
    const { rows } = await this.pool.query('select * from media_items where id = $1', [
      id,
    ]);
    return rows[0] ? toItem(rows[0]) : null;
  }

  async list(classId: string, publishedOnly: boolean) {
    const { rows } = await this.pool.query(
      `select * from media_items where class_id = $1
          ${publishedOnly ? "and status = 'ready' and published_at is not null" : ''}
        order by created_at desc`,
      [classId]
    );
    return rows.map(toItem);
  }

  async classBytes(classId: string) {
    const { rows } = await this.pool.query(
      'select coalesce(sum(original_size), 0)::bigint as n from media_items where class_id = $1',
      [classId]
    );
    return Number(rows[0].n);
  }

  async update(id: string, change: Parameters<MediaRepository['update']>[1]) {
    const entries = Object.entries(change).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return;
    const sets = entries.map(([k], i) => `${COLUMNS[k]} = $${i + 2}`);
    await this.pool.query(
      `update media_items set ${sets.join(', ')}, updated_at = now() where id = $1`,
      [id, ...entries.map(([k, v]) => (k === 'renditions' ? JSON.stringify(v) : v))]
    );
  }

  async publish(id: string, userId: string) {
    await this.pool.query(
      `update media_items set published_at = now(), consent_confirmed_by = $2, updated_at = now()
        where id = $1 and published_at is null`,
      [id, userId]
    );
  }

  async remove(id: string) {
    await this.pool.query('delete from media_items where id = $1', [id]);
  }
}
