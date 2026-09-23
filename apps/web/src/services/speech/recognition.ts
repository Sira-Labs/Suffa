/**
 * Speech recognition (SpeechRecognition, ar-SA) for pronunciation scoring.
 *
 * The Web Speech Recognition API is not available everywhere (notably Firefox).
 * Hence: feature detection + graceful fallback. Scoring compares the recognised
 * text tashkil-tolerantly with the target and returns a rough similarity.
 */
import { logger } from '@/services/logger';
import { normalizeArabic } from '@/services/srs/tashkil';

const log = logger.child('speech:recognition');

// Minimal type for the (non-standard) SpeechRecognition API.
interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionResultEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string; confidence: number }>>;
}

interface RecognitionWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
}

export function isRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as RecognitionWindow;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export interface RecognitionResult {
  transcript: string;
  confidence: number;
  /** 0..1 similarity to the target word (tashkil-tolerant). */
  similarity: number;
}

/**
 * Levenshtein-based similarity on normalised Arabic strings.
 * Exported so scoring can be checked without a microphone (e.g. in tests).
 */
export function pronunciationSimilarity(spoken: string, target: string): number {
  const a = normalizeArabic(spoken);
  const b = normalizeArabic(target);
  if (a === '' && b === '') return 1;
  if (a === '' || b === '') return 0;
  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }
  return dp[m]![n]!;
}

/** Why a recognition attempt produced no result (maps the Web Speech error codes). */
export type RecognitionFailure =
  | 'unsupported'
  | 'not-allowed'
  | 'service-not-allowed'
  | 'language-not-supported'
  | 'no-speech'
  | 'audio-capture'
  | 'network'
  | 'timeout'
  | 'error';

export type RecognitionOutcome =
  | { ok: true; result: RecognitionResult }
  | { ok: false; reason: RecognitionFailure };

/** Maps a Web Speech `error` code to a failure the UI can explain. */
export function classifyRecognitionError(code: string): RecognitionFailure {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
    case 'language-not-supported':
    case 'no-speech':
    case 'audio-capture':
    case 'network':
      return code;
    case 'aborted':
      return 'no-speech';
    default:
      return 'error';
  }
}

/** Safety net: some mobile engines (notably iOS) never fire `end`. */
export const RECOGNITION_TIMEOUT_MS = 10_000;

export interface RecognizeOptions {
  target: string;
  lang?: string;
  timeoutMs?: number;
}

/**
 * Starts a one-shot recognition. Always resolves, with the result or with the
 * reason there is none (never hangs: timeout as a safety net).
 * Must be called directly from a tap/click (iOS requires the gesture).
 */
export function recognizeOnce(options: RecognizeOptions): Promise<RecognitionOutcome> {
  const w = typeof window === 'undefined' ? undefined : (window as RecognitionWindow);
  const Ctor = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
  if (!Ctor) {
    log.warn('SpeechRecognition not supported');
    return Promise.resolve({ ok: false, reason: 'unsupported' });
  }

  return new Promise((resolve) => {
    let settled = false;
    // Holder, because settle() may run before the timeout is scheduled.
    const timeout: { id?: ReturnType<typeof setTimeout> } = {};
    const settle = (outcome: RecognitionOutcome) => {
      if (settled) return;
      settled = true;
      if (timeout.id) clearTimeout(timeout.id);
      resolve(outcome);
    };

    let recognition: SpeechRecognitionLike;
    try {
      recognition = new Ctor();
    } catch (cause) {
      log.warn('SpeechRecognition could not be created', {
        cause: String(cause),
      });
      settle({ ok: false, reason: 'unsupported' });
      return;
    }
    recognition.lang = options.lang ?? 'ar-SA';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const first = event.results[0]?.[0];
      if (!first || !first.transcript.trim()) {
        settle({ ok: false, reason: 'no-speech' });
        return;
      }
      settle({
        ok: true,
        result: {
          transcript: first.transcript,
          confidence: first.confidence,
          similarity: pronunciationSimilarity(first.transcript, options.target),
        },
      });
    };
    recognition.onerror = (event) => {
      const reason = classifyRecognitionError(event.error);
      log.warn('Recognition error', { code: event.error, reason });
      settle({ ok: false, reason });
    };
    recognition.onend = () => settle({ ok: false, reason: 'no-speech' });

    timeout.id = setTimeout(() => {
      log.warn('Recognition timeout');
      try {
        recognition.stop();
      } catch {
        // Already stopped: nothing to clean up.
      }
      settle({ ok: false, reason: 'timeout' });
    }, options.timeoutMs ?? RECOGNITION_TIMEOUT_MS);

    try {
      recognition.start();
    } catch (cause) {
      // e.g. InvalidStateError when a previous session is still running.
      log.warn('Recognition start failed', { cause: String(cause) });
      settle({ ok: false, reason: 'error' });
    }
  });
}
