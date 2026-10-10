/**
 * Finds when each line of a book page is read aloud by matching the line's text (from OCR)
 * with what is said (from speech recognition), letter by letter. Both texts are reduced to
 * the bare Arabic letters first: vowel marks, tatweel and spaces differ between print, OCR
 * and recognition, the letters mostly do not.
 *
 * The alignment is global and in order (Gotoh, affine gaps): the reader goes through the
 * book from start to end, but may repeat a line, say something that is not printed (an
 * exercise's number, "the first lesson"), or skip one. A stretch of speech that matches no
 * line costs only its opening; a line that matches nothing (a picture read as text, OCR
 * noise) costs per letter. The texts never leave this process; only seconds come out.
 */

const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const FOLD = new Map([
  ['أ', 'ا'],
  ['إ', 'ا'],
  ['آ', 'ا'],
  ['ٱ', 'ا'],
  ['ى', 'ي'],
  ['ئ', 'ي'],
  ['ؤ', 'و'],
  ['ة', 'ه'],
]);

/** The bare Arabic letters of a text, with hamza seats, alif maqsura and ta marbuta folded. */
export function letters(text) {
  let out = '';
  for (const ch of text.normalize('NFC').replace(MARKS, '')) {
    const folded = FOLD.get(ch) ?? ch;
    if (folded >= 'ء' && folded <= 'ي') out += folded;
  }
  return out;
}

const MATCH = 3;
const MISMATCH = -2;
const SPEECH_OPEN = -4;
const SPEECH_EXTEND = 0;
const LINE_OPEN = -3;
const LINE_EXTEND = -1;
const NONE = -1e9;

/**
 * Aligns `book` with `speech` (strings of letters) and returns, for every book letter, the
 * index of the spoken letter it was matched to (equal letters only), or -1.
 */
export function alignLetters(book, speech) {
  const n = book.length;
  const m = speech.length;
  const w = m + 1;
  // Best score ending in: M a letter pair, S skipping speech, B skipping book.
  let M = new Float64Array(w);
  let S = new Float64Array(w);
  let B = new Float64Array(w);
  // Where each state came from: 0 = M, 1 = S, 2 = B; one byte per state and cell.
  const fromM = new Uint8Array((n + 1) * w);
  const fromS = new Uint8Array((n + 1) * w);
  const fromB = new Uint8Array((n + 1) * w);
  // Speech before the first line is free: the reader may start with a greeting.
  M.fill(NONE);
  B.fill(NONE);
  S.fill(0);
  M[0] = 0;
  S[0] = NONE;
  for (let j = 1; j <= m; j++) fromS[j] = 1;
  for (let i = 1; i <= n; i++) {
    const M2 = new Float64Array(w);
    const S2 = new Float64Array(w);
    const B2 = new Float64Array(w);
    const row = i * w;
    M2[0] = NONE;
    S2[0] = NONE;
    B2[0] = i === 1 ? LINE_OPEN : B[0] + LINE_EXTEND;
    fromB[row] = i === 1 ? 0 : 2;
    for (let j = 1; j <= m; j++) {
      const pair = book.charCodeAt(i - 1) === speech.charCodeAt(j - 1) ? MATCH : MISMATCH;
      let best = M[j - 1];
      let from = 0;
      if (S[j - 1] > best) [best, from] = [S[j - 1], 1];
      if (B[j - 1] > best) [best, from] = [B[j - 1], 2];
      M2[j] = best + pair;
      fromM[row + j] = from;

      let s = M2[j - 1] + SPEECH_OPEN;
      let sFrom = 0;
      if (S2[j - 1] + SPEECH_EXTEND > s) [s, sFrom] = [S2[j - 1] + SPEECH_EXTEND, 1];
      if (B2[j - 1] + SPEECH_OPEN > s) [s, sFrom] = [B2[j - 1] + SPEECH_OPEN, 2];
      S2[j] = s;
      fromS[row + j] = sFrom;

      let b = M[j] + LINE_OPEN;
      let bFrom = 0;
      if (B[j] + LINE_EXTEND > b) [b, bFrom] = [B[j] + LINE_EXTEND, 2];
      if (S[j] + LINE_OPEN > b) [b, bFrom] = [S[j] + LINE_OPEN, 1];
      B2[j] = b;
      fromB[row + j] = bFrom;
    }
    M = M2;
    S = S2;
    B = B2;
  }
  // Speech after the last line is free as well: end in the best cell of the last row.
  let state = 0;
  let j = m;
  let best = NONE;
  for (let k = 0; k <= m; k++) {
    const ends = [M[k], S[k], B[k]];
    for (let st = 0; st < 3; st++) {
      if (ends[st] > best) [best, state, j] = [ends[st], st, k];
    }
  }
  const matched = new Int32Array(n).fill(-1);
  let i = n;
  while (i > 0 && j >= 0) {
    const cell = i * w + j;
    if (state === 0) {
      if (j === 0) break;
      if (book.charCodeAt(i - 1) === speech.charCodeAt(j - 1)) matched[i - 1] = j - 1;
      state = fromM[cell];
      i--;
      j--;
    } else if (state === 1) {
      if (j === 0) break;
      state = fromS[cell];
      j--;
    } else {
      state = fromB[cell];
      i--;
    }
  }
  return matched;
}

/**
 * When each line is read: the first and last spoken letter matched to it (the first time it
 * is said, when it is said twice), or null when too
 * little of the line was found (`minShare` of its letters) to trust it. Letters matched far
 * from the rest of their line (more than `reach` seconds from its median) are strays and
 * left out.
 *
 * `lines` are the OCR texts in reading order; `words` the recognised words with seconds.
 */
export function lineTimes(
  lines,
  words,
  { minShare = 0.4, minLetters = 2, reach = 20 } = {}
) {
  let speech = '';
  const at = [];
  for (const word of words) {
    const text = letters(word.w);
    const span = Math.max(word.e - word.s, 0);
    for (let k = 0; k < text.length; k++) {
      speech += text[k];
      at.push(word.s + (span * k) / text.length);
    }
  }
  let book = '';
  const owner = [];
  const sizes = lines.map((line, index) => {
    const text = letters(line);
    book += text;
    for (let k = 0; k < text.length; k++) owner.push(index);
    return text.length;
  });
  const matched = alignLetters(book, speech);
  const found = lines.map(() => []);
  matched.forEach((j, k) => {
    if (j >= 0) found[owner[k]].push(j);
  });
  let previousEnd = -1;
  return found.map((indices, index) => {
    const middle = at[indices[Math.floor(indices.length / 2)]];
    const near = indices.filter((j) => Math.abs(at[j] - middle) <= reach);
    if (near.length < minLetters || near.length < sizes[index] * minShare) return null;
    let first = near[0];
    const last = near[near.length - 1];
    // A line said twice in a row: the alignment may take the repeat (one gap less), but the
    // line starts when it is first said.
    const said = speech.slice(first, last + 1);
    const earlier = speech.indexOf(said, previousEnd + 1);
    if (earlier >= 0 && earlier < first) first = earlier;
    previousEnd = last;
    return { start: at[first], end: at[last] };
  });
}
