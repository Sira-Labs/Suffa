/**
 * Pronunciation feedback letter by letter (ADR-0022, stories 15.2/15.3).
 *
 * Two assessors behind one interface:
 * - `AsrAssessor` sends the learner's own recording to Suffa's server, which has it
 *   transcribed by an EU speech recogniser and rates it. The recording made for listening
 *   back is reused, so the learner speaks once (also on iPhone, where Safari records mp4).
 * - `BrowserAssessor` listens with the browser's speech recognition and rates locally.
 * Both rate with `assessLetters` from @suffa/phonology, so the feedback looks the same.
 */
import { assessLetters, G2pError, type Assessment } from '@suffa/phonology';
import { apiRequest, type ApiResult, type Fetch } from '@/services/api/request';
import { logger } from '@/services/logger';
import type { Recording } from '@/services/audio';
import { recognizeOnce, type RecognitionFailure } from './recognition';

export type { Assessment, LetterResult, LetterStatus } from '@suffa/phonology';

const log = logger.child('speech:assessor');

export type AssessFailure =
  | { source: 'browser'; reason: RecognitionFailure }
  | { source: 'server'; status: number; code: string; message: string }
  /** The text cannot be rated letter by letter (not vocalised Arabic). */
  | { source: 'text' };

export type AssessOutcome =
  | { ok: true; assessment: Assessment }
  | { ok: false; failure: AssessFailure };

export interface PronunciationAssessor {
  /** Rates how the learner said `text` (vocalised Arabic). */
  assess(text: string, recording?: Recording): Promise<AssessOutcome>;
}

/** Rates a transcript locally; a text the rules cannot read gives no rating. */
export function rateTranscript(text: string, transcript: string): AssessOutcome {
  try {
    return { ok: true, assessment: assessLetters(text, transcript) };
  } catch (error) {
    if (!(error instanceof G2pError)) throw error;
    log.warn('Text cannot be rated letter by letter', { index: error.index });
    return { ok: false, failure: { source: 'text' } };
  }
}

const MESSAGES: Record<string, string> = {
  speech_unavailable:
    'Die Bewertung auf dem Server ist gerade nicht erreichbar. Versuch es über den Browser.',
  speech_off_for_class: 'Deine Klasse hat die Bewertung auf dem Server ausgeschaltet.',
  rate_limited: 'Sehr viele Bewertungen in kurzer Zeit – bitte einen Moment warten.',
  unsupported_audio: 'Dieses Aufnahmeformat kann der Server nicht lesen.',
  audio_too_short: 'Die Aufnahme ist zu kurz. Sprich den ganzen Satz.',
  payload_too_large: 'Die Aufnahme ist zu lang. Sprich nur diesen Satz.',
  invalid_text: 'Dieser Satz lässt sich nicht Buchstabe für Buchstabe bewerten.',
};

/** Suffa's speech endpoints. */
export class SpeechApi {
  constructor(private readonly fetchImpl: Fetch = (...args) => fetch(...args)) {}

  /** Whether this learner's recordings may be rated on the server. */
  settings(): Promise<ApiResult<{ server: boolean }>> {
    return apiRequest(this.fetchImpl, '/api/v1/speech/settings', {}, MESSAGES);
  }

  assess(text: string, recording: Recording): Promise<ApiResult<Assessment>> {
    const form = new FormData();
    form.set('text', text);
    form.set('audio', recording.blob);
    return apiRequest(
      this.fetchImpl,
      '/api/v1/speech/assess',
      { method: 'POST', body: form },
      MESSAGES
    );
  }

  /** The class's setting (teachers). */
  classSetting(classId: string): Promise<ApiResult<{ serverSpeech: boolean }>> {
    return apiRequest(
      this.fetchImpl,
      `/api/v1/classes/${encodeURIComponent(classId)}/speech`,
      {},
      MESSAGES
    );
  }

  setClassSetting(classId: string, serverSpeech: boolean): Promise<ApiResult<void>> {
    return apiRequest(
      this.fetchImpl,
      `/api/v1/classes/${encodeURIComponent(classId)}/speech`,
      { method: 'PUT', body: JSON.stringify({ serverSpeech }) },
      MESSAGES
    );
  }
}

/** Rates the learner's recording on the server. */
export class AsrAssessor implements PronunciationAssessor {
  constructor(private readonly api: SpeechApi) {}

  async assess(text: string, recording?: Recording): Promise<AssessOutcome> {
    if (!recording) {
      return {
        ok: false,
        failure: { source: 'server', status: 0, code: 'no_recording', message: '' },
      };
    }
    const result = await this.api.assess(text, recording);
    if (result.ok) return { ok: true, assessment: result.value };
    log.warn('Server assessment failed', { status: result.status, code: result.code });
    return {
      ok: false,
      failure: {
        source: 'server',
        status: result.status,
        code: result.code,
        message: result.message,
      },
    };
  }
}

/**
 * Listens with the browser's speech recognition and rates locally. Must be called directly
 * from a tap (iOS allows recognition only inside the gesture); ignores any recording.
 */
export class BrowserAssessor implements PronunciationAssessor {
  constructor(private readonly recognize: typeof recognizeOnce = recognizeOnce) {}

  async assess(text: string): Promise<AssessOutcome> {
    const outcome = await this.recognize({ target: text });
    if (!outcome.ok)
      return { ok: false, failure: { source: 'browser', reason: outcome.reason } };
    return rateTranscript(text, outcome.result.transcript);
  }
}
