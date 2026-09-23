/**
 * Spracherkennung (SpeechRecognition, ar-SA) für Aussprache-Scoring.
 *
 * Die Web Speech Recognition API ist nicht überall verfügbar (v. a. Firefox).
 * Daher: Feature-Detection + Graceful Fallback. Das Scoring vergleicht das
 * Erkannte tashkil-tolerant mit dem Ziel und gibt eine grobe Ähnlichkeit zurück.
 */
import { logger } from '@/services/logger';
import { normalizeArabic } from '@/services/srs/tashkil';

const log = logger.child('speech:recognition');

// Minimaltyp für die (nicht-standardisierte) SpeechRecognition-API.
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
  /** 0..1 Ähnlichkeit zum Zielwort (tashkil-tolerant). */
  similarity: number;
}

/**
 * Levenshtein-basierte Ähnlichkeit auf normalisierten arabischen Strings.
 * Exportiert, damit das Scoring auch ohne Mikrofon (z. B. in Tests) prüfbar ist.
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
 * Startet eine einmalige Erkennung. Resolved immer – mit dem Ergebnis oder mit dem
 * Grund, warum es keins gibt (nie hängend: Timeout als Sicherheitsnetz).
 * Muss direkt aus einem Tipp/Klick heraus aufgerufen werden (iOS verlangt die Geste).
 */
export function recognizeOnce(options: RecognizeOptions): Promise<RecognitionOutcome> {
  const w = typeof window === 'undefined' ? undefined : (window as RecognitionWindow);
  const Ctor = w?.SpeechRecognition ?? w?.webkitSpeechRecognition;
  if (!Ctor) {
    log.warn('SpeechRecognition nicht unterstützt');
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
      log.warn('SpeechRecognition konnte nicht erstellt werden', {
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
      log.warn('Recognition-Fehler', { code: event.error, reason });
      settle({ ok: false, reason });
    };
    recognition.onend = () => settle({ ok: false, reason: 'no-speech' });

    timeout.id = setTimeout(() => {
      log.warn('Recognition-Timeout');
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
      log.warn('Recognition-Start fehlgeschlagen', { cause: String(cause) });
      settle({ ok: false, reason: 'error' });
    }
  });
}
