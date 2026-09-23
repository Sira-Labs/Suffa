/**
 * Text-to-Speech über die Web Speech API (SpeechSynthesis).
 *
 * Graceful Fallback: ist keine Synthese oder keine arabische Stimme verfügbar,
 * melden die Funktionen das, statt zu werfen. Die UI kann dann z. B. den
 * Sprechen-Button deaktivieren oder einen Hinweis zeigen.
 */
import { logger } from '@/services/logger';

const log = logger.child('speech:tts');

export function isTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

function pickArabicVoice(): SpeechSynthesisVoice | null {
  if (!isTtsSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  const arabic = voices.find((v) => v.lang.toLowerCase().startsWith('ar'));
  return arabic ?? null;
}

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  lang?: string;
}

export function speakArabic(text: string, options: SpeakOptions = {}): boolean {
  if (!isTtsSupported()) {
    log.warn('TTS nicht unterstützt');
    return false;
  }
  const synth = window.speechSynthesis;
  synth.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = options.lang ?? 'ar-SA';
  utter.rate = options.rate ?? 0.9;
  utter.pitch = options.pitch ?? 1;
  const voice = pickArabicVoice();
  if (voice) utter.voice = voice;
  synth.speak(utter);
  return true;
}

export function stopSpeaking(): void {
  if (isTtsSupported()) window.speechSynthesis.cancel();
}
