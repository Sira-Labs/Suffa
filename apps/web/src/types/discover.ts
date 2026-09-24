/**
 * Curated media library "Entdecken" (redesign v2, step 4): YouTube channels and items picked
 * for Suffa learners. Only links, titles and our notes are stored; videos are embedded with
 * YouTube's player (no-cookie) and never copied (ADR-0023).
 */
export type DiscoverCategory = 'sprache' | 'quran' | 'geschichten' | 'podcasts';

export interface DiscoverItem {
  type: 'video' | 'playlist';
  /** YouTube video id or playlist id. */
  id: string;
  title: string;
  /** Why we recommend it (German). */
  why: string;
  minutes: number | null;
}

export interface DiscoverChannel {
  handle: string;
  channelId: string;
  title: string;
  url: string;
  category: DiscoverCategory;
  /** Language of instruction, e.g. "Englisch". */
  language: string;
  /** "MSA", "Quran" or a dialect. */
  variety: string;
  /** Suitable levels (Stufen), e.g. "1" or "1-2". */
  level: string;
  why: string;
  items: DiscoverItem[];
}

export interface DiscoverCatalog {
  retrieved: string;
  channels: DiscoverChannel[];
}

/** An item together with its channel, as the library lists it. */
export interface DiscoverEntry extends DiscoverItem {
  channel: DiscoverChannel;
}
