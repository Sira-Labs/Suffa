/**
 * Friendly HTTP answers for AI failures (story 9.4): the learner reads a calm German sentence,
 * the client gets a stable error code. Anything else is rethrown to the error handler.
 */
import { LlmError, RouteUnavailableError } from '@suffa/llm';
import { AiQuotaError } from './gateway.js';

export interface AiErrorResponse {
  status: 429 | 503 | 400;
  body: { error: string; message: string; limit?: number };
}

export function aiErrorResponse(error: unknown): AiErrorResponse | null {
  if (error instanceof AiQuotaError) {
    return {
      status: 429,
      body: {
        error: 'ai_quota',
        message: `Für heute hast du alle ${error.limit} Gespräche mit al-Muʿallim genutzt. Morgen geht es weiter – übe bis dahin mit deinen Karten.`,
        limit: error.limit,
      },
    };
  }
  if (error instanceof RouteUnavailableError) {
    return error.reason === 'budget_exhausted'
      ? {
          status: 503,
          body: {
            error: 'ai_paused',
            message:
              'Die KI-Funktionen machen diesen Monat Pause. Alle anderen Übungen gehen wie gewohnt.',
          },
        }
      : {
          status: 503,
          body: {
            error: 'ai_unavailable',
            message:
              'al-Muʿallim ist gerade nicht erreichbar. Versuche es gleich noch einmal.',
          },
        };
  }
  if (error instanceof LlmError && error.kind === 'bad_request') {
    return {
      status: 400,
      body: {
        error: 'ai_bad_request',
        message: 'Diese Anfrage konnte nicht bearbeitet werden.',
      },
    };
  }
  return null;
}
