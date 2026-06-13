/**
 * Tashkīl-tolerante Verarbeitung arabischer Eingaben.
 *
 * Beim Active Recall soll der Lerner nicht an fehlenden Harakāt scheitern:
 * „سكن“ wird als korrekt akzeptiert, auch wenn das Ziel „سَكَنَ“ voll vokalisiert ist.
 * Gleichzeitig liefern wir ein Diff für spezifisches Feedback.
 */

// Arabische diakritische Zeichen (Harakāt, Shadda, Sukūn, Tanwīn, Dagger-Alif …)
const TASHKIL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

/** Entfernt alle Tashkīl-Zeichen und Tatwīl. */
export function stripTashkil(input: string): string {
  return input.replace(TASHKIL, '').replace(TATWEEL, '');
}

/**
 * Normalisiert arabischen Text für den toleranten Vergleich:
 * - entfernt Tashkīl & Tatwīl
 * - vereinheitlicht Alif-Varianten (أ إ آ ٱ → ا)
 * - vereinheitlicht Yāʾ/Alif-maqsūra (ى → ي) und Tāʾ marbūṭa (ة → ه)
 * - kollabiert Whitespace
 */
export function normalizeArabic(input: string): string {
  return stripTashkil(input)
    .replace(/[أإآٱ]/g, 'ا') // Hamza-Alif-Varianten → ا
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/‌|‍|‎|‏/g, '') // Zero-width/Direction marks
    .replace(/\s+/g, ' ')
    .trim();
}

export type AnswerVerdict = 'exact' | 'tashkil-tolerant' | 'wrong';

/**
 * Vergleicht eine Lerner-Eingabe mit dem Ziel.
 * - 'exact': identisch inkl. Tashkīl
 * - 'tashkil-tolerant': gleicher Konsonant-Skelett, aber Harakāt weichen ab
 * - 'wrong': inhaltlich falsch
 */
export function gradeAnswer(input: string, target: string): AnswerVerdict {
  if (input.normalize('NFC').trim() === target.normalize('NFC').trim()) {
    return 'exact';
  }
  if (
    normalizeArabic(input) === normalizeArabic(target) &&
    normalizeArabic(input) !== ''
  ) {
    return 'tashkil-tolerant';
  }
  return 'wrong';
}

export interface DiffSegment {
  text: string;
  status: 'equal' | 'added' | 'removed';
}

/**
 * Einfaches zeichenweises Diff (LCS) für spezifisches Schreib-Feedback.
 * `removed` = im Ziel, aber nicht eingegeben; `added` = eingegeben, aber falsch.
 */
export function diffArabic(input: string, target: string): DiffSegment[] {
  const a = Array.from(input);
  const b = Array.from(target);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] =
        a[i] === b[j]
          ? lcs[i + 1]![j + 1]! + 1
          : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const segments: DiffSegment[] = [];
  let i = 0;
  let j = 0;
  const push = (text: string, status: DiffSegment['status']) => {
    const last = segments[segments.length - 1];
    if (last && last.status === status) last.text += text;
    else segments.push({ text, status });
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push(a[i]!, 'equal');
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push(a[i]!, 'added');
      i++;
    } else {
      push(b[j]!, 'removed');
      j++;
    }
  }
  while (i < n) push(a[i++]!, 'added');
  while (j < m) push(b[j++]!, 'removed');
  return segments;
}
