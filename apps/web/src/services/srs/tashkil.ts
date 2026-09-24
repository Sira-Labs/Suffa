/**
 * Tashkīl-tolerant processing of Arabic input.
 *
 * In active recall the learner should not fail because of missing harakāt:
 * "سكن" is accepted as correct even if the target "سَكَنَ" is fully vocalised.
 * We also provide a diff for specific feedback.
 */

// Arabic diacritics (harakāt, shadda, sukūn, tanwīn, dagger alif …)
const TASHKIL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

/** Removes all tashkīl marks and tatwīl. */
export function stripTashkil(input: string): string {
  return input.replace(TASHKIL, '').replace(TATWEEL, '');
}

/**
 * Normalises Arabic text for tolerant comparison:
 * - removes tashkīl & tatwīl
 * - unifies alif variants (أ إ آ ٱ → ا)
 * - unifies yāʾ/alif maqsūra (ى → ي) and tāʾ marbūṭa (ة → ه)
 * - collapses whitespace
 */
export function normalizeArabic(input: string): string {
  return stripTashkil(input)
    .replace(/[أإآٱ]/g, 'ا') // hamza alif variants → ا
    .replace(/ى/g, 'ي') // ى → ي
    .replace(/ة/g, 'ه') // ة → ه
    .replace(/‌|‍|‎|‏/g, '') // Zero-width/Direction marks
    .replace(/\s+/g, ' ')
    .trim();
}

export type AnswerVerdict = 'exact' | 'tashkil-tolerant' | 'wrong';

/**
 * Compares a learner's input with the target.
 * - 'exact': identical including tashkīl
 * - 'tashkil-tolerant': same consonant skeleton, but harakāt differ
 * - 'wrong': incorrect
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
 * Simple character-level diff (LCS) for specific spelling feedback.
 * `removed` = in the target but not typed; `added` = typed but wrong.
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
