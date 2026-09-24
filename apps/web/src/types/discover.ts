/**
 * Curated media library "Entdecken" (redesign v2, step 4): YouTube channels and items picked
 * for Suffa learners. Only links, titles and our notes are stored; videos are embedded with
 * YouTube's player (no-cookie) and never copied (ADR-0023).
 */
import type { Syncable } from './srs';

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

/**
 * A library item the learner opened: started items are pinned to "Weiterschauen" (newest
 * first) until they are marked as seen or the learner unpins them. Local like the other
 * engagement tables.
 */
export interface DiscoverProgress extends Syncable {
  /** Same id as the seen record: `yt/${item.id}`. */
  id: string;
  /** First time the item was played (null when only pinned by hand). */
  startedAt: string | null;
  /** Last time it was played or pinned; orders "Weiterschauen". */
  openedAt: string;
  pinned: boolean;
}
