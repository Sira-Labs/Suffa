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

/**
 * The bare Arabic letters of a text, with hamza seats, alif maqsura and ta marbuta folded,
 * and هنذا (OCR of هـٰذا) as هذا.
 */
export function letters(text) {
  let out = '';
  for (const ch of text.normalize('NFC').replace(MARKS, '')) {
    const folded = FOLD.get(ch) ?? ch;
    if (folded >= 'ء' && folded <= 'ي') out += folded;
  }
  // The small alif over هـٰذا is often read as a nūn or lām.
  return out.replace(/ه[نل]ذ/g, 'هذ');
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

/** Edit distance between two strings of letters. */
function distance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(
        row[j] + 1,
        next[j - 1] + 1,
        row[j - 1] + (a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1)
      );
    }
    row = next;
  }
  return row[b.length];
}

/** Length of the longest run of letters two strings share in order (not necessarily adjacent). */
function common(a, b) {
  let row = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const next = [0];
    for (let j = 1; j <= b.length; j++) {
      next[j] =
        a.charCodeAt(i - 1) === b.charCodeAt(j - 1)
          ? row[j - 1] + 1
          : Math.max(row[j], next[j - 1]);
    }
    row = next;
  }
  return row[b.length];
}

/**
 * Where `text` is said in `speech` between `from` and `to` (letter indices), as
 * { first, last, share } with share = 1 − edit distance / length; the earliest place reaching
 * `enough`, else the best one at all. Null when there is no room.
 */
export function findSaid(text, speech, from, to, enough = 1) {
  const n = text.length;
  const end = Math.min(speech.length, to + 1);
  const at = (p) => {
    let here = null;
    // On a tie the longer window: a spoken word may run past the letters the OCR saw.
    for (const len of [n + 1, n, n - 1]) {
      if (len < 1 || p + len > end) continue;
      const share = 1 - distance(text, speech.slice(p, p + len)) / n;
      if (!here || share > here.share) here = { first: p, last: p + len - 1, share };
    }
    return here;
  };
  let best = null;
  for (let p = Math.max(0, from); p + n - 1 <= end; p++) {
    const here = at(p);
    if (!here) continue;
    if (here.share >= enough) {
      // The best fit around the first good one: a window may reach a letter early.
      let fit = here;
      for (let q = p + 1; q <= p + Math.ceil(n / 2); q++) {
        const next = at(q);
        if (next && next.share > fit.share) fit = next;
      }
      return fit;
    }
    if (!best || here.share > best.share) best = here;
  }
  return best;
}

/**
 * The OCR reading of a line most like what is said in the recording (`speech`, letters): the
 * one whose best place in it scores most, length × resemblance², so a long reading that fits
 * well beats a short scrap that fits anywhere and long noise that fits badly.
 */
export function pickReading(readings, speech) {
  let best = readings[0] ?? '';
  let bestScore = -1;
  for (const reading of readings) {
    const text = letters(reading);
    if (text.length < 2) continue;
    const hit = findSaid(text, speech, 0, speech.length - 1, 1);
    const score = hit ? text.length * hit.share ** 2 : 0;
    if (score > bestScore) [best, bestScore] = [reading, score];
  }
  return best;
}

/**
 * The matched letters of one line, split where speech is skipped for longer than `pause`
 * seconds (the reader repeating a line, or a stray letter from another line); the largest
 * group, the earliest of equals.
 */
function densest(indices, at, pause) {
  let best = [];
  let group = [];
  for (const j of indices) {
    if (group.length > 0 && at[j] - at[group[group.length - 1]] > pause) {
      if (group.length > best.length) best = group;
      group = [];
    }
    group.push(j);
  }
  return group.length > best.length ? group : best;
}

/**
 * When each line is read, in four steps:
 * - The letters matched to a line are grouped where speech is skipped for a while, and the
 *   largest group counts; too few letters (`minShare` of the line) and the line is not found.
 * - What was heard there must hold the line (at least `minResemblance` of its letters, in
 *   order, هذا left out): a line read badly by the OCR may otherwise be matched only by its
 *   هذا, which most lines have.
 * - A line not found is looked for where no other line was heard: between its found
 *   neighbours (in reading order, favoured by `inOrderBonus`) or anywhere in its page's
 *   stretch of the recording, since a page may be read column by column although its lines
 *   are listed row by row. The best fit is kept when it resembles the line enough
 *   (`fillShare`);
 *   only for lines of `fillLetters` letters or more (shorter ones are mostly picture specks).
 * - Two lines of a page heard in the opposite order are swapped back when either fits either
 *   place about as well (`swapTolerance`): the recognition drops the أ of أهذا.
 * - A line heard after the line printed below it moves between its neighbours when a free
 *   place there fits it (a later sentence that sounds alike had taken it).
 * - The reader repeats a line several times; the line starts when it is first said: the
 *   earliest place after the line said before it that sounds the same (`sameShare`).
 *
 * `lines` are the OCR texts in reading order, `pages` (optional) the page of each; `words`
 * the recognised words with seconds. Lines may come out of reading order in time.
 */
export function lineTimes(
  lines,
  words,
  {
    pages = lines.map(() => 0),
    minShare = 0.4,
    minLetters = 2,
    pause = 1.2,
    minResemblance = 0.45,
    sameShare = 0.75,
    fillShare = 0.5,
    fillLetters = 5,
    inOrderBonus = 0.1,
    swapTolerance = 0.3,
    slack = 2,
  } = {}
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
  const texts = lines.map((line, index) => {
    const text = letters(line);
    book += text;
    for (let k = 0; k < text.length; k++) owner.push(index);
    return text;
  });
  const matched = alignLetters(book, speech);
  const found = lines.map(() => []);
  matched.forEach((j, k) => {
    if (j >= 0) found[owner[k]].push(j);
  });
  // How much of a line is heard in a stretch of speech: the share of its letters found there
  // in order. هذا opens most lines of the first lessons: when the line has more, only the
  // rest counts, since that is what tells the lines apart.
  const resemblance = (text, first, last) => {
    let a = text;
    let b = speech.slice(first, Math.min(last, speech.length - 1) + 1);
    if (a.includes('هذا') && a.replaceAll('هذا', '').length >= 2) {
      a = a.replaceAll('هذا', '');
      b = b.replaceAll('هذا', '');
    }
    return a.length === 0 ? 0 : common(a, b) / a.length;
  };
  const spans = found.map((indices, i) => {
    const group = densest(indices, at, pause);
    if (group.length < minLetters || group.length < texts[i].length * minShare)
      return null;
    const span = { first: group[0], last: group[group.length - 1] };
    return resemblance(texts[i], span.first, span.last) >= minResemblance ? span : null;
  });

  // Lines not found, within their page's stretch of speech, where no other line was heard.
  const taken = new Uint8Array(speech.length);
  const take = (span) => taken.fill(1, span.first, span.last + 1);
  spans.forEach((span) => span && take(span));
  const stretch = (page) => {
    let from = 0;
    let to = speech.length - 1;
    spans.forEach((span, i) => {
      if (!span) return;
      if (pages[i] < page) from = Math.max(from, span.last + 1);
      if (pages[i] > page) to = Math.min(to, span.first - 1);
    });
    return [from, to];
  };
  const freeRuns = (from, to) => {
    const runs = [];
    for (let p = from; p <= to; p++) {
      if (taken[p]) continue;
      let q = p;
      while (q < to && !taken[q + 1]) q++;
      runs.push([p, q]);
      p = q;
    }
    return runs;
  };
  const bestIn = (text, runs) => {
    let best = null;
    for (const [p, q] of runs) {
      const hit = findSaid(text, speech, p, q, 1);
      if (hit && (!best || hit.share > best.share)) best = hit;
    }
    return best;
  };
  // Longest lines first: the most letters, the surest fit; picture specks come last.
  const missing = spans
    .map((span, i) => i)
    .filter((i) => !spans[i] && texts[i].length >= fillLetters)
    .sort((a, b) => texts[b].length - texts[a].length);
  for (const i of missing) {
    // Between the found lines before and after it, in reading order (preferred), or
    // anywhere free in its page's stretch.
    const before = spans.slice(0, i).findLast(Boolean);
    const after = spans.slice(i + 1).find(Boolean);
    const between = bestIn(
      texts[i],
      freeRuns(before ? before.last + 1 : 0, after ? after.first - 1 : speech.length - 1)
    );
    const anywhere = bestIn(texts[i], freeRuns(...stretch(pages[i])));
    const inOrder =
      between && (!anywhere || between.share + inOrderBonus >= anywhere.share);
    const hit = inOrder ? { ...between, share: between.share + inOrderBonus } : anywhere;
    // The place must also hold the line beyond its هذا.
    if (
      hit &&
      hit.share >= fillShare &&
      resemblance(texts[i], hit.first, hit.last + slack) >= minResemblance
    ) {
      spans[i] = { first: hit.first, last: hit.last };
      take(spans[i]);
    }
  }

  // Two lines of a page that sound alike (هذا ولد, أهذا ولد: the recognition often drops
  // the أ) keep their reading order when their places could be either's.
  for (let i = 0; i < spans.length; i++) {
    for (let j = i + 1; j < spans.length; j++) {
      const a = spans[i];
      const b = spans[j];
      if (!a || !b || pages[i] !== pages[j] || a.first < b.first) continue;
      const own =
        resemblance(texts[i], a.first, a.last) + resemblance(texts[j], b.first, b.last);
      const swapped =
        resemblance(texts[i], b.first, b.last) + resemblance(texts[j], a.first, a.last);
      if (swapped >= own - swapTolerance) [spans[i], spans[j]] = [b, a];
    }
  }

  // A line heard after the line printed below it on its page may have been matched to a
  // later sentence that sounds alike (an exercise repeating it): it moves to a fitting free
  // place between its neighbours in reading order, if there is one.
  spans.forEach((span, i) => {
    if (!span) return;
    const nextOnPage = spans.findIndex((s, k) => k > i && s && pages[k] === pages[i]);
    if (nextOnPage < 0 || span.first < spans[nextOnPage].first) return;
    const before = spans.slice(0, i).findLast(Boolean);
    taken.fill(0, span.first, span.last + 1);
    const hit = bestIn(
      texts[i],
      freeRuns(before ? before.last + 1 : 0, spans[nextOnPage].first - 1)
    );
    if (
      hit &&
      hit.share + inOrderBonus >= fillShare &&
      resemblance(texts[i], hit.first, hit.last + slack) >= minResemblance
    ) {
      spans[i] = { first: hit.first, last: hit.last };
    }
    take(spans[i]);
  });

  // Each line from the first time it is said, in the order they are said.
  const order = spans
    .map((span, i) => ({ span, i }))
    .filter((s) => s.span)
    .sort((a, b) => a.span.first - b.span.first);
  const times = lines.map(() => null);
  let previousLast = -1;
  for (const { span, i } of order) {
    const said = speech.slice(span.first, span.last + 1);
    // Short phrases (ما هذا) are said everywhere: only longer ones are searched back.
    const hit =
      said.length >= fillLetters
        ? findSaid(said, speech, previousLast + 1, span.first - 1, sameShare)
        : null;
    const first = hit && hit.share >= sameShare ? hit.first : span.first;
    previousLast = Math.max(previousLast, span.last);
    times[i] = { start: at[first], end: at[span.last] };
  }
  return times;
}
