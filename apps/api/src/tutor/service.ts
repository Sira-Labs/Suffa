/**
 * One tutor turn (stories 10.1, 10.2, 10.4): load or start the conversation, build the grounded
 * prompt, stream the model's answer while running its tool calls (at most MAX_ROUNDS model
 * calls, counted as one turn), validate the answer with one repair attempt, and store what the
 * learner saw.
 */
import { randomUUID } from 'node:crypto';
import type { LlmMessage } from '@suffa/llm';
import type { Logger } from 'pino';
import type { Actor } from '../authz/policies.js';
import type { AiGateway } from '../ai/gateway.js';
import { aiErrorResponse } from '../ai/errors.js';
import type { ContentCatalog } from './content.js';
import type { LearnerState } from './learner.js';
import { buildSystem, type TurnContext } from './prompt.js';
import type { TutorRepository } from './repository.js';
import { runTool, TUTOR_TOOLS, type MediaAccess } from './tools.js';
import {
  BLOCKING,
  fallbackMessage,
  repairInstruction,
  validateAnswer,
  type Flag,
} from './validate.js';

export const TUTOR_TASK = 'tutor.converse';
/** Model calls per turn: tool rounds plus the final answer. */
export const MAX_ROUNDS = 4;
/** Earlier messages sent along (the prompt stays small and cheap). */
export const HISTORY_MESSAGES = 16;

export interface TurnInput {
  conversationId?: string;
  message: string;
  context?: TurnContext;
}

export type TutorEvent =
  | { type: 'start'; conversationId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  /** The shown answer was replaced after validation (repair or fallback). */
  | { type: 'replace'; text: string }
  | { type: 'done'; messageId: string; flags: Flag[] }
  | { type: 'error'; error: string; message: string };

export interface TutorDeps {
  gateway: AiGateway;
  repo: TutorRepository;
  catalog: ContentCatalog;
  learner: LearnerState;
  media: MediaAccess | null;
  log: Pick<Logger, 'info' | 'warn'>;
  newId?: () => string;
}

export class TutorService {
  private readonly newId: () => string;

  constructor(private readonly deps: TutorDeps) {
    this.newId = deps.newId ?? randomUUID;
  }

  /** A conversation id of someone else is answered like an unknown one. */
  async *turn(
    actor: Actor,
    input: TurnInput,
    signal?: AbortSignal
  ): AsyncIterable<TutorEvent> {
    const { repo } = this.deps;
    let conversation = input.conversationId
      ? await repo.get(input.conversationId, actor.id)
      : null;
    if (input.conversationId && !conversation) {
      yield { type: 'error', error: 'not_found', message: 'Gespräch nicht gefunden.' };
      return;
    }
    if (!conversation) {
      const id = this.newId();
      const context = input.context ?? {};
      await repo.create({
        id,
        userId: actor.id,
        title: input.message.slice(0, 80),
        context,
      });
      conversation = { id, title: input.message.slice(0, 80), context, updatedAt: '' };
    }
    yield { type: 'start', conversationId: conversation.id };

    const history = await repo.messages(conversation.id, HISTORY_MESSAGES);
    await repo.add({
      id: this.newId(),
      conversationId: conversation.id,
      role: 'user',
      content: input.message,
    });
    const snapshot = await this.deps.learner.snapshot(actor.id);
    const context = { ...conversation.context, ...input.context };
    const system = buildSystem(this.deps.catalog, snapshot, context);
    const messages: LlmMessage[] = [
      ...history.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: input.message },
    ];

    let shown = '';
    let model: string | null = null;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const last = round === MAX_ROUNDS - 1;
        let result = null;
        for await (const event of this.deps.gateway.stream(
          actor,
          TUTOR_TASK,
          // The last round has no tools, so the turn always ends with an answer.
          { system, messages, signal, ...(last ? {} : { tools: TUTOR_TOOLS }) },
          { continuation: round > 0 }
        )) {
          if (event.type === 'text') {
            shown += event.text;
            yield event;
          } else result = event.result;
        }
        if (!result) break;
        model = result.model;
        if (result.toolCalls.length === 0) break;
        messages.push({
          role: 'assistant',
          content: result.text,
          toolCalls: result.toolCalls,
          replay: result.replay,
        });
        const ctx = {
          actor,
          catalog: this.deps.catalog,
          learner: this.deps.learner,
          media: this.deps.media,
        };
        const results = [];
        for (const call of result.toolCalls) {
          yield { type: 'tool', name: call.name };
          results.push(await runTool(call, ctx));
        }
        messages.push({ role: 'tool', results });
        if (shown && !/\s$/.test(shown)) {
          shown += '\n\n';
          yield { type: 'text', text: '\n\n' };
        }
      }

      let answer = shown.trim();
      let flags = validateAnswer(answer, snapshot.tashkilLevel);
      if (flags.length > 0) {
        this.deps.log.info({ flags, conversationId: conversation.id }, 'tutor.repair');
        const repaired = await this.deps.gateway.complete(
          actor,
          TUTOR_TASK,
          {
            system,
            messages: [
              ...messages,
              { role: 'assistant', content: answer || '…' },
              { role: 'user', content: repairInstruction(flags, snapshot.tutorLanguage) },
            ],
            signal,
          },
          { continuation: true }
        );
        const again = validateAnswer(repaired.text, snapshot.tashkilLevel);
        answer = again.some((f) => BLOCKING.has(f))
          ? fallbackMessage(snapshot.tutorLanguage)
          : repaired.text.trim();
        flags = again;
        model = repaired.model;
        yield { type: 'replace', text: answer };
      }

      const messageId = this.newId();
      await repo.add({
        id: messageId,
        conversationId: conversation.id,
        role: 'assistant',
        content: answer,
        model,
        flags,
      });
      yield { type: 'done', messageId, flags };
    } catch (error) {
      const mapped = aiErrorResponse(error);
      if (!mapped) throw error;
      yield { type: 'error', error: mapped.body.error, message: mapped.body.message };
    }
  }
}
