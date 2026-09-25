/**
 * The video catalog (ADR-0012, stories 12.1, 12.3, 12.4). Channels carry the creator's
 * permission: transcripts and checkpoints reach learners only when it is "granted".
 */
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { writeAudit } from '../audit/log.js';
import { inTransaction } from '../db/transaction.js';
import type { CheckpointData, Cue } from '../media/interactive.js';
import { guessUnit, type YouTubeVideo } from './youtube.js';

export type PermissionStatus = 'unknown' | 'requested' | 'granted' | 'declined';

export interface VideoChannel {
  id: string;
  name: string;
  youtubeChannelId: string | null;
  playlists: string[];
  permissionStatus: PermissionStatus;
  permissionNotes: string;
  contactedAt: string | null;
  lastImportAt: string | null;
  lastImportError: string | null;
  videoCount: number;
}

export interface Video {
  id: string;
  channelId: string;
  youtubeId: string;
  title: string;
  durationSec: number | null;
  thumbnailUrl: string | null;
  unit: number | null;
  hidden: boolean;
  position: number;
}

export interface PublicVideo extends Omit<Video, 'hidden' | 'channelId' | 'position'> {
  channel: { name: string };
  /** The creator allowed transcripts and exercises. */
  interactive: boolean;
}

export interface VideoCheckpoint {
  id: string;
  atSec: number;
  data: CheckpointData;
}

export interface Change {
  actorId: string;
  ipAddress: string | null;
}

const channelOf = (r: Record<string, unknown>): VideoChannel => ({
  id: r.id as string,
  name: r.name as string,
  youtubeChannelId: (r.youtube_channel_id as string | null) ?? null,
  playlists: r.playlists as string[],
  permissionStatus: r.permission_status as PermissionStatus,
  permissionNotes: r.permission_notes as string,
  contactedAt: (r.contacted_at as string | null) ?? null,
  lastImportAt: r.last_import_at ? (r.last_import_at as Date).toISOString() : null,
  lastImportError: (r.last_import_error as string | null) ?? null,
  videoCount: Number(r.video_count ?? 0),
});

const videoOf = (r: Record<string, unknown>): Video => ({
  id: r.id as string,
  channelId: r.channel_id as string,
  youtubeId: r.youtube_id as string,
  title: r.title as string,
  durationSec: (r.duration_sec as number | null) ?? null,
  thumbnailUrl: (r.thumbnail_url as string | null) ?? null,
  unit: (r.unit as number | null) ?? null,
  hidden: r.hidden as boolean,
  position: r.position as number,
});

export class PgVideoRepository {
  constructor(private readonly pool: pg.Pool) {}

  async channels(): Promise<VideoChannel[]> {
    const { rows } = await this.pool.query(
      `select c.*, c.contacted_at::text as contacted_at,
              (select count(*) from videos v where v.channel_id = c.id) as video_count
         from video_channels c order by c.name`
    );
    return rows.map(channelOf);
  }

  async channel(id: string): Promise<VideoChannel | null> {
    const { rows } = await this.pool.query(
      `select c.*, c.contacted_at::text as contacted_at, 0 as video_count
         from video_channels c where id = $1`,
      [id]
    );
    return rows[0] ? channelOf(rows[0]) : null;
  }

  async createChannel(
    input: { name: string; youtubeChannelId: string | null; playlists: string[] },
    change: Change
  ): Promise<string> {
    const id = randomUUID();
    await inTransaction(this.pool, async (db) => {
      await db.query(
        `insert into video_channels (id, name, youtube_channel_id, playlists, updated_by)
         values ($1, $2, $3, $4, $5)`,
        [id, input.name, input.youtubeChannelId, input.playlists, change.actorId]
      );
      await writeAudit(db, {
        actorId: change.actorId,
        action: 'video.channel_created',
        targetType: 'video_channel',
        targetId: id,
        details: { name: input.name, playlists: input.playlists },
        ipAddress: change.ipAddress,
      });
    });
    return id;
  }

  /** Changes a channel (permission changes are audit-logged with before/after). */
  async updateChannel(
    id: string,
    patch: Partial<{
      name: string;
      playlists: string[];
      permissionStatus: PermissionStatus;
      permissionNotes: string;
      contactedAt: string | null;
    }>,
    change: Change
  ): Promise<boolean> {
    return inTransaction(this.pool, async (db) => {
      const before = await db.query(
        'select permission_status, name, playlists from video_channels where id = $1 for update',
        [id]
      );
      if (!before.rows[0]) return false;
      await db.query(
        `update video_channels set
           name = coalesce($2, name),
           playlists = coalesce($3, playlists),
           permission_status = coalesce($4, permission_status),
           permission_notes = coalesce($5, permission_notes),
           contacted_at = case when $6::boolean then $7::date else contacted_at end,
           updated_by = $8, updated_at = now()
         where id = $1`,
        [
          id,
          patch.name ?? null,
          patch.playlists ?? null,
          patch.permissionStatus ?? null,
          patch.permissionNotes ?? null,
          patch.contactedAt !== undefined,
          patch.contactedAt ?? null,
          change.actorId,
        ]
      );
      await writeAudit(db, {
        actorId: change.actorId,
        action:
          patch.permissionStatus &&
          patch.permissionStatus !== before.rows[0].permission_status
            ? 'video.permission_changed'
            : 'video.channel_updated',
        targetType: 'video_channel',
        targetId: id,
        details: {
          from: before.rows[0].permission_status,
          ...patch,
        },
        ipAddress: change.ipAddress,
      });
      return true;
    });
  }

  async markImport(id: string, error: string | null): Promise<void> {
    await this.pool.query(
      `update video_channels set last_import_at = now(), last_import_error = $2 where id = $1`,
      [id, error]
    );
  }

  /** Inserts new videos and refreshes known ones; a unit set by an admin is kept. */
  async upsertVideos(channelId: string, videos: YouTubeVideo[]): Promise<number> {
    let added = 0;
    for (const v of videos) {
      const { rows } = await this.pool.query(
        `insert into videos (id, channel_id, youtube_id, title, duration_sec, thumbnail_url,
           published_at, playlist_id, position, unit)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         on conflict (youtube_id) do update set
           title = excluded.title, duration_sec = excluded.duration_sec,
           thumbnail_url = excluded.thumbnail_url, published_at = excluded.published_at,
           playlist_id = excluded.playlist_id, position = excluded.position,
           unit = coalesce(videos.unit, excluded.unit), imported_at = now()
         where videos.channel_id = excluded.channel_id
         returning (xmax = 0) as inserted`,
        [
          randomUUID(),
          channelId,
          v.youtubeId,
          v.title,
          v.durationSec,
          v.thumbnailUrl,
          v.publishedAt,
          v.playlistId,
          v.position,
          guessUnit(v.title),
        ]
      );
      if (rows[0]?.inserted) added += 1;
    }
    return added;
  }

  async adminVideos(): Promise<Video[]> {
    const { rows } = await this.pool.query(
      `select * from videos order by channel_id, playlist_id, position, title`
    );
    return rows.map(videoOf);
  }

  async updateVideo(
    id: string,
    patch: { unit?: number | null; hidden?: boolean }
  ): Promise<boolean> {
    const { rows } = await this.pool.query(
      `update videos set
         unit = case when $2::boolean then $3::int else unit end,
         hidden = coalesce($4, hidden)
       where id = $1 returning id`,
      [id, patch.unit !== undefined, patch.unit ?? null, patch.hidden ?? null]
    );
    return rows.length > 0;
  }

  /** Whether learners can find any lesson (decides the video quest, story 12.5). */
  async hasVisibleVideos(): Promise<boolean> {
    const { rows } = await this.pool.query(
      'select exists (select 1 from videos where not hidden) as any'
    );
    return rows[0]?.any === true;
  }

  /** Visible lessons for learners, optionally of one unit, in course order. */
  async publicVideos(unit: number | null): Promise<PublicVideo[]> {
    const { rows } = await this.pool.query(
      `select v.*, c.name as channel_name, c.permission_status
         from videos v join video_channels c on c.id = v.channel_id
        where not v.hidden and ($1::int is null or v.unit = $1)
        order by v.unit nulls last, v.playlist_id, v.position, v.title
        limit 500`,
      [unit]
    );
    return rows.map((r) => {
      const { hidden: _h, channelId: _c, position: _p, ...video } = videoOf(r);
      return {
        ...video,
        channel: { name: r.channel_name as string },
        interactive: r.permission_status === 'granted',
      };
    });
  }

  async publicVideo(id: string): Promise<PublicVideo | null> {
    const { rows } = await this.pool.query(
      `select v.*, c.name as channel_name, c.permission_status
         from videos v join video_channels c on c.id = v.channel_id
        where v.id = $1 and not v.hidden`,
      [id]
    );
    const r = rows[0];
    if (!r) return null;
    const { hidden: _h, channelId: _c, position: _p, ...video } = videoOf(r);
    return {
      ...video,
      channel: { name: r.channel_name as string },
      interactive: r.permission_status === 'granted',
    };
  }

  async checkpoints(videoId: string): Promise<VideoCheckpoint[]> {
    const { rows } = await this.pool.query(
      'select id, at_sec, data from video_checkpoints where video_id = $1 order by at_sec',
      [videoId]
    );
    return rows.map((r) => ({ id: r.id, atSec: r.at_sec, data: r.data }));
  }

  async addCheckpoint(
    videoId: string,
    atSec: number,
    data: CheckpointData,
    by: string
  ): Promise<VideoCheckpoint> {
    const id = randomUUID();
    await this.pool.query(
      `insert into video_checkpoints (id, video_id, at_sec, data, created_by)
       values ($1, $2, $3, $4::jsonb, $5)`,
      [id, videoId, atSec, JSON.stringify(data), by]
    );
    return { id, atSec, data };
  }

  async removeCheckpoint(videoId: string, id: string): Promise<boolean> {
    const { rows } = await this.pool.query(
      'delete from video_checkpoints where video_id = $1 and id = $2 returning id',
      [videoId, id]
    );
    return rows.length > 0;
  }

  async transcript(videoId: string): Promise<Cue[]> {
    const { rows } = await this.pool.query(
      'select cues from video_transcripts where video_id = $1',
      [videoId]
    );
    return (rows[0]?.cues as Cue[] | undefined) ?? [];
  }

  async saveTranscript(videoId: string, cues: Cue[], by: string): Promise<void> {
    await this.pool.query(
      `insert into video_transcripts (video_id, cues, updated_by) values ($1, $2::jsonb, $3)
       on conflict (video_id) do update set cues = excluded.cues,
         updated_by = excluded.updated_by, updated_at = now()`,
      [videoId, JSON.stringify(cues), by]
    );
  }
}
