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

export interface RecognizeOptions {
  target: string;
  lang?: string;
  onError?: (code: string) => void;
}

/**
 * Startet eine einmalige Erkennung. Resolved mit dem Ergebnis oder `null`,
 * wenn nicht unterstützt / kein Treffer.
 */
export function recognizeOnce(
  options: RecognizeOptions
): Promise<RecognitionResult | null> {
  if (!isRecognitionSupported()) {
    log.warn('SpeechRecognition nicht unterstützt');
    options.onError?.('unsupported');
    return Promise.resolve(null);
  }
  const w = window as RecognitionWindow;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return Promise.resolve(null);

  return new Promise((resolve) => {
    const recognition = new Ctor();
    recognition.lang = options.lang ?? 'ar-SA';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.continuous = false;

    let settled = false;
    recognition.onresult = (event) => {
      const first = event.results[0]?.[0];
      if (!first) {
        settled = true;
        resolve(null);
        return;
      }
      settled = true;
      resolve({
        transcript: first.transcript,
        confidence: first.confidence,
        similarity: pronunciationSimilarity(first.transcript, options.target),
      });
    };
    recognition.onerror = (event) => {
      log.warn('Recognition-Fehler', { code: event.error });
      options.onError?.(event.error);
      if (!settled) {
        settled = true;
        resolve(null);
      }
    };
    recognition.onend = () => {
      if (!settled) {
        settled = true;
        resolve(null);
      }
    };
    recognition.start();
  });
}
