/**
 * Server tools of al-Muʿallim (story 10.2, ADR-0011). The model only chooses a tool and its
 * input; who the data is about always comes from the signed-in actor, and every input is
 * validated before it runs. Results are compact JSON strings.
 */
import type { ToolCall, ToolResult, ToolSpec } from '@suffa/llm';
import { z } from 'zod';
import type { Actor } from '../authz/policies.js';
import type { ContentCatalog, Word } from './content.js';
import type { LearnerState } from './learner.js';

export interface MediaSegment {
  title: string;
  fromSec: number;
  toSec: number;
  text: string;
}

/** Transcript lines around a moment of a class recording the actor may watch. */
export interface MediaAccess {
  segment(
    actor: Actor,
    mediaId: string,
    atSec: number
  ): Promise<MediaSegment | 'forbidden' | 'not_found'>;
}

export interface ToolContext {
  actor: Actor;
  catalog: ContentCatalog;
  learner: LearnerState;
  media: MediaAccess | null;
}

export const TUTOR_TOOLS: ToolSpec[] = [
  {
    name: 'lookup_vocab',
    description:
      'Search the course vocabulary by Arabic (with or without vowel marks), transliteration or German meaning. Use it before stating a vocalisation, plural or meaning of a course word.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Word or meaning to find.' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_root_family',
    description:
      'All course words and verbs of one Arabic root, in course order. The root may be written like ك-ت-ب or كتب.',
    inputSchema: {
      type: 'object',
      properties: { root: { type: 'string' } },
      required: ['root'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_learner_state',
    description:
      "The learner's progress: current unit, cards due, words they keep forgetting, last test.",
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_media_segment',
    description:
      'Transcript of a class recording around a moment (about 45 seconds before and after). Use it when the learner asks about a recording.',
    inputSchema: {
      type: 'object',
      properties: {
        mediaId: { type: 'string' },
        atSec: { type: 'number', description: 'Moment in seconds from the start.' },
      },
      required: ['mediaId', 'atSec'],
      additionalProperties: false,
    },
  },
];

const Query = z.object({ query: z.string().trim().min(1).max(100) });
const Root = z.object({ root: z.string().trim().min(1).max(20) });
const Segment = z.object({
  mediaId: z.string().uuid(),
  atSec: z
    .number()
    .min(0)
    .max(24 * 3600),
});

const word = (w: Word) => ({
  ar: w.ar,
  tr: w.tr,
  de: w.de,
  root: w.wurzel || null,
  plural: w.plural ?? null,
  unit: w.einheit,
  ...(w.hinweis ? { note: w.hinweis } : {}),
});

function ok(call: ToolCall, value: unknown): ToolResult {
  return { callId: call.id, content: JSON.stringify(value) };
}

function fail(call: ToolCall, message: string): ToolResult {
  return { callId: call.id, content: message, isError: true };
}

/** Runs one tool call; unknown tools and invalid input become error results for the model. */
export async function runTool(call: ToolCall, ctx: ToolContext): Promise<ToolResult> {
  switch (call.name) {
    case 'lookup_vocab': {
      const input = Query.safeParse(call.input);
      if (!input.success) return fail(call, 'query must be a non-empty string');
      const found = ctx.catalog.search(input.data.query);
      return ok(call, found.length ? found.map(word) : { found: 0 });
    }
    case 'get_root_family': {
      const input = Root.safeParse(call.input);
      if (!input.success) return fail(call, 'root must be a short Arabic root');
      const family = ctx.catalog.rootFamily(input.data.root);
      return ok(call, {
        words: family.words.map(word),
        verbs: family.verbs.map((v) => ({ lemma: v.lemma, de: v.de, pattern: v.wazn })),
      });
    }
    case 'get_learner_state': {
      const { firstName: _name, ...state } = await ctx.learner.snapshot(ctx.actor.id);
      return ok(call, state);
    }
    case 'get_media_segment': {
      if (!ctx.media) return fail(call, 'recordings are not available on this server');
      const input = Segment.safeParse(call.input);
      if (!input.success)
        return fail(call, 'mediaId must be a recording id, atSec seconds');
      const segment = await ctx.media.segment(
        ctx.actor,
        input.data.mediaId,
        input.data.atSec
      );
      if (segment === 'forbidden' || segment === 'not_found') {
        // Same answer for both: the model must not learn which recordings exist.
        return fail(call, 'no such recording for this learner');
      }
      return ok(call, segment);
    }
    default:
      return fail(call, `unknown tool ${call.name}`);
  }
}
