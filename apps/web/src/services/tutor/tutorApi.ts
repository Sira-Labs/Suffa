/**
 * Client for al-Muʿallim (Sprint 10). A turn streams server-sent events over a POST request
 * (EventSource only does GET), parsed here from the response body.
 */
import { apiRequest, type Fetch } from '@/services/api/request';

export type TutorLanguage = 'de' | 'en';

export interface TurnContext {
  unit?: number;
  mediaId?: string;
  atSec?: number;
}

export interface ConversationSummary {
  id: string;
  title: string;
  context: TurnContext;
  updatedAt: string;
}

export interface TutorMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  rating: -1 | 1 | null;
  createdAt: string;
}

export type TutorEvent =
  | { type: 'start'; conversationId: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string }
  | { type: 'replace'; text: string }
  | { type: 'done'; messageId: string; flags: string[] }
  | { type: 'error'; error: string; message: string };

const MESSAGES: Record<string, string> = {
  invalid_body: 'Die Nachricht ist leer oder zu lang (höchstens 2000 Zeichen).',
};

/** Splits an SSE byte stream into the JSON payloads of its `data:` lines. */
export async function* readEvents(
  body: ReadableStream<Uint8Array>
): AsyncIterable<TutorEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += done ? `${decoder.decode()}\n\n` : decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n\n')) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const data = block
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data) yield JSON.parse(data) as TutorEvent;
    }
    if (done) return;
  }
}

export class TutorApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  overview() {
    return this.call<{
      available: boolean;
      tutorLanguage: TutorLanguage;
      conversations: ConversationSummary[];
    }>('/api/v1/tutor');
  }

  setLanguage(tutorLanguage: TutorLanguage) {
    return this.call<void>('/api/v1/tutor/settings', {
      method: 'PUT',
      body: JSON.stringify({ tutorLanguage }),
    });
  }

  conversation(id: string) {
    return this.call<{ conversation: ConversationSummary; messages: TutorMessage[] }>(
      `/api/v1/tutor/conversations/${encodeURIComponent(id)}`
    );
  }

  remove(id: string) {
    return this.call<void>(`/api/v1/tutor/conversations/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  rate(messageId: string, rating: -1 | 1 | null) {
    return this.call<void>(
      `/api/v1/tutor/messages/${encodeURIComponent(messageId)}/rating`,
      {
        method: 'PUT',
        body: JSON.stringify({ rating }),
      }
    );
  }

  /** Streams one turn; problems before the stream starts arrive as an `error` event too. */
  async *turn(
    input: { conversationId?: string; message: string; context?: TurnContext },
    signal?: AbortSignal
  ): AsyncIterable<TutorEvent> {
    let response: Response;
    try {
      response = await this.fetchImpl('/api/v1/tutor/turn', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
        body: JSON.stringify(input),
        signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      yield { type: 'error', error: 'offline', message: 'Keine Verbindung.' };
      return;
    }
    if (!response.ok || !response.body) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      const code = body?.error ?? 'server_error';
      yield {
        type: 'error',
        error: code,
        message:
          MESSAGES[code] ??
          (response.status === 401
            ? 'Bitte melde dich an.'
            : `al-Muʿallim antwortet gerade nicht (${response.status}).`),
      };
      return;
    }
    yield* readEvents(response.body);
  }

  private call<T>(path: string, init: RequestInit = {}) {
    return apiRequest<T>(this.fetchImpl, path, init, MESSAGES);
  }
}

/** Arabic letters in a text, for the "write Arabic to the tutor" quest. */
export function countArabicLetters(text: string): number {
  return (text.match(/[ء-ي]/g) ?? []).length;
}
