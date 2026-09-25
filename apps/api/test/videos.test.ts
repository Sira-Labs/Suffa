/** YouTube import building blocks (story 12.1): API client, durations, unit guess, errors. */
import { describe, expect, it, vi } from 'vitest';
import { importChannel, runImportJob } from '../src/videos/jobs.js';
import {
  guessUnit,
  parseDuration,
  YouTubeClient,
  YouTubeError,
} from '../src/videos/youtube.js';

describe('parseDuration', () => {
  it('reads ISO 8601 durations', () => {
    expect(parseDuration('PT12M5S')).toBe(725);
    expect(parseDuration('PT1H2M3S')).toBe(3723);
    expect(parseDuration('P1DT1S')).toBe(86_401);
    expect(parseDuration('P0D')).toBeNull();
    expect(parseDuration(undefined)).toBeNull();
    expect(parseDuration('nonsense')).toBeNull();
  });
});

describe('guessUnit', () => {
  it('finds the unit in Arabic, English and German titles', () => {
    expect(guessUnit('العربية بين يديك – الدرس ٥: الأسرة')).toBe(5);
    expect(guessUnit('الوحدة رقم 12')).toBe(12);
    expect(guessUnit('Lesson 3 – greetings')).toBe(3);
    expect(guessUnit('Einheit 16')).toBe(16);
    expect(guessUnit('Lesson 42')).toBeNull();
    expect(guessUnit('Vorwort')).toBeNull();
  });
});

describe('YouTubeClient', () => {
  it('reads all pages of a playlist and skips private or not embeddable videos', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      calls.push(`${url.pathname}?${url.searchParams.get('pageToken') ?? ''}`);
      expect(url.searchParams.get('key')).toBe('yt-key');
      if (url.pathname.endsWith('/playlistItems')) {
        const second = url.searchParams.get('pageToken') === 'p2';
        return Response.json({
          ...(second ? {} : { nextPageToken: 'p2' }),
          items: (second ? ['cccccccccc3'] : ['aaaaaaaaaa1', 'bbbbbbbbbb2']).map(
            (id, i) => ({
              contentDetails: { videoId: id },
              snippet: { position: second ? 2 : i },
            })
          ),
        });
      }
      return Response.json({
        items: [
          {
            id: 'aaaaaaaaaa1',
            snippet: {
              title: 'الدرس ١',
              publishedAt: '2024-01-01T00:00:00Z',
              thumbnails: { medium: { url: 'https://i.ytimg.com/a.jpg' } },
            },
            contentDetails: { duration: 'PT10M' },
            status: { privacyStatus: 'public', embeddable: true },
          },
          {
            id: 'bbbbbbbbbb2',
            snippet: { title: 'privat' },
            contentDetails: { duration: 'PT1M' },
            status: { privacyStatus: 'private' },
          },
          {
            id: 'cccccccccc3',
            snippet: { title: 'no embed' },
            contentDetails: {},
            status: { embeddable: false },
          },
        ],
      });
    }) as unknown as typeof fetch;
    const videos = await new YouTubeClient('yt-key', fetchImpl).playlist(
      'PLabcdefghijkl'
    );
    expect(videos).toEqual([
      {
        youtubeId: 'aaaaaaaaaa1',
        title: 'الدرس ١',
        durationSec: 600,
        thumbnailUrl: 'https://i.ytimg.com/a.jpg',
        publishedAt: '2024-01-01T00:00:00Z',
        playlistId: 'PLabcdefghijkl',
        position: 0,
      },
    ]);
    expect(calls).toEqual([
      '/youtube/v3/playlistItems?',
      '/youtube/v3/playlistItems?p2',
      '/youtube/v3/videos?',
    ]);
  });

  it('turns an API error into a YouTubeError', async () => {
    const fetchImpl = (async () =>
      Response.json(
        { error: { message: 'API key not valid' } },
        { status: 400 }
      )) as unknown as typeof fetch;
    const error = await new YouTubeClient('bad', fetchImpl)
      .playlist('PLx')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(YouTubeError);
    expect(error).toMatchObject({ status: 400, message: 'API key not valid' });
  });
});

describe('importChannel', () => {
  const channel = { id: 'c1', playlists: ['PL1', 'PL2'] };
  const quiet = { info: () => undefined, warn: () => undefined };

  it('imports every playlist and records success', async () => {
    const videos = {
      channel: vi.fn(async () => channel as never),
      channels: vi.fn(async () => [channel] as never),
      upsertVideos: vi.fn(async () => 2),
      markImport: vi.fn(async () => {}),
    };
    const youtube = { playlist: vi.fn(async () => []) };
    expect(await importChannel({ videos, youtube, log: quiet }, 'c1')).toBe(4);
    expect(youtube.playlist.mock.calls).toEqual([['PL1'], ['PL2']]);
    expect(videos.markImport).toHaveBeenCalledWith('c1', null);
    await runImportJob({ videos, youtube, log: quiet }, { task: 'youtube-all' });
    expect(youtube.playlist).toHaveBeenCalledTimes(4);
  });

  it('records a YouTube error on the channel and rethrows anything else', async () => {
    const videos = {
      channel: vi.fn(async () => channel as never),
      channels: vi.fn(async () => []),
      upsertVideos: vi.fn(async () => 0),
      markImport: vi.fn(async () => {}),
    };
    await importChannel(
      {
        videos,
        youtube: { playlist: async () => Promise.reject(new YouTubeError(403, 'quota')) },
        log: quiet,
      },
      'c1'
    );
    expect(videos.markImport).toHaveBeenCalledWith('c1', 'quota');
    await expect(
      importChannel(
        {
          videos,
          youtube: { playlist: async () => Promise.reject(new TypeError('bug')) },
          log: quiet,
        },
        'c1'
      )
    ).rejects.toThrow('bug');
    expect(
      await importChannel(
        {
          ...{ videos: { ...videos, channel: async () => null } },
          youtube: { playlist: async () => [] },
          log: quiet,
        },
        'x'
      )
    ).toBe(0);
  });
});
