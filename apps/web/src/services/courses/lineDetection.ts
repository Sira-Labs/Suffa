/**
 * Finds the text lines on a book page image without reading them: a line is a band of rows
 * with ink in it. Runs in the admin's browser on archive.org's page image (which allows CORS);
 * only the boxes are kept, never the image or its text (ADR-0023).
 *
 * - Arabic diacritics above and below a line form thin bands of their own; they are joined to
 *   the line they belong to.
 * - The Medina book puts pictures beside the text, often reaching into the text's rows. Ink
 *   that hangs together in a shape much taller than a letter is a picture: it is wiped out
 *   first, with what lies inside it. A frame around a table is wiped too, its contents kept.
 * - What is left of a picture: a block much taller than a line is banded again with less
 *   joining, else split at the rightmost blank column gap, and each side is searched for lines
 *   again; what stays taller than a line there is left out.
 * - Captions side by side (one under each picture) are lines of their own: a row is cut where
 *   it has a wide blank stretch.
 */

/** A box as fractions of the page: x, y, width, height. */
export type Box = [number, number, number, number];

export interface LineDetectionOptions {
  /** Grey value (0–255) below which a pixel counts as ink. */
  inkBelow?: number;
  /** Share of a row's pixels that must be ink for the row to count as text. */
  minRowInk?: number;
  /** Margins left out on every side (scan edges), as fractions of the page. */
  margin?: number;
  /** The bottom of the page left out: the rule and copyright line under every page. */
  footer?: number;
}

const DEFAULTS: Required<LineDetectionOptions> = {
  inkBelow: 150,
  minRowInk: 0.004,
  margin: 0.03,
  footer: 0.115,
};

interface Band {
  top: number;
  bottom: number; // exclusive
}

interface Region extends Band {
  left: number;
  right: number; // exclusive
}

const height = (b: Band) => b.bottom - b.top;

/** Bounding box of a group of connected ink pixels, in pixels (right and bottom exclusive). */
interface Shape extends Region {
  pixels: number;
}

/** Groups 8-connected ink pixels; returns each pixel's group (-1 for no ink) and the groups. */
function connectedShapes(ink: Uint8Array, width: number, pageHeight: number) {
  const group = new Int32Array(width * pageHeight).fill(-1);
  const shapes: Shape[] = [];
  const stack: number[] = [];
  for (let start = 0; start < ink.length; start++) {
    if (!ink[start] || group[start]! >= 0) continue;
    const id = shapes.length;
    const shape: Shape = { left: width, right: 0, top: pageHeight, bottom: 0, pixels: 0 };
    group[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const p = stack.pop()!;
      const x = p % width;
      const y = (p - x) / width;
      shape.pixels++;
      if (x < shape.left) shape.left = x;
      if (x >= shape.right) shape.right = x + 1;
      if (y < shape.top) shape.top = y;
      if (y >= shape.bottom) shape.bottom = y + 1;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= pageHeight) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (ink[q] && group[q]! < 0) {
            group[q] = id;
            stack.push(q);
          }
        }
      }
    }
    shapes.push(shape);
  }
  return { group, shapes };
}

/**
 * The page with its pictures wiped out (set to white). A picture is a shape far taller than
 * the letters (or wide and tall); shapes lying inside it go with it. A shape wider than most
 * of the page is a frame or a table's grid: only its own lines go.
 */
export function withoutPictures(
  grey: ArrayLike<number>,
  width: number,
  pageHeight: number,
  inkBelow = DEFAULTS.inkBelow
): Uint8ClampedArray {
  const out = Uint8ClampedArray.from(grey);
  const ink = new Uint8Array(width * pageHeight);
  for (let i = 0; i < ink.length; i++) ink[i] = out[i]! < inkBelow ? 1 : 0;
  const { group, shapes } = connectedShapes(ink, width, pageHeight);
  const letter = median(
    shapes.filter((s) => s.pixels >= 8 && height(s) >= 4).map((s) => height(s))
  );
  if (letter === 0) return out;
  const isPicture = (s: Shape) =>
    height(s) > Math.max(3 * letter, 0.05 * pageHeight) ||
    (s.right - s.left > 0.25 * width && height(s) > 2 * letter);
  const wiped = new Uint8Array(shapes.length);
  const pictures: Shape[] = [];
  shapes.forEach((s, id) => {
    if (!isPicture(s)) return;
    wiped[id] = 1;
    if (s.right - s.left <= 0.6 * width) pictures.push(s);
  });
  shapes.forEach((s, id) => {
    if (
      pictures.some(
        (p) =>
          s.left >= p.left && s.right <= p.right && s.top >= p.top && s.bottom <= p.bottom
      )
    ) {
      wiped[id] = 1;
    }
  });
  for (let i = 0; i < out.length; i++) {
    const id = group[i]!;
    if (id >= 0 && wiped[id]) out[i] = 255;
  }
  return out;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** A line's height: the median of the smaller half of the bands (pictures are tall). */
function lineHeight(bands: Band[]): number {
  const heights = bands.map(height).sort((a, b) => a - b);
  return median(heights.slice(0, Math.max(1, Math.ceil(heights.length / 2))));
}

class Page {
  private readonly grey: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
  private readonly o: Required<LineDetectionOptions>;

  constructor(
    grey: ArrayLike<number>,
    width: number,
    pageHeight: number,
    options: Required<LineDetectionOptions>
  ) {
    // Plain fields (no parameter properties): the content tools load this file with Node's
    // type stripping.
    this.grey = grey;
    this.width = width;
    this.height = pageHeight;
    this.o = options;
  }

  ink(x: number, y: number): boolean {
    return this.grey[y * this.width + x]! < this.o.inkBelow;
  }

  /** Bands of rows with ink between `left` and `right`, diacritic bands joined. */
  bands(r: Region, typical?: number): Band[] {
    const span = r.right - r.left;
    if (span <= 0) return [];
    const inkyRow = (y: number) => {
      let n = 0;
      for (let x = r.left; x < r.right; x++) if (this.ink(x, y)) n++;
      return n / span >= this.o.minRowInk && n >= 2;
    };
    let bands: Band[] = [];
    let start = -1;
    for (let y = r.top; y < r.bottom; y++) {
      if (inkyRow(y)) {
        if (start < 0) start = y;
      } else if (start >= 0) {
        bands.push({ top: start, bottom: y });
        start = -1;
      }
    }
    if (start >= 0) bands.push({ top: start, bottom: r.bottom });
    if (bands.length === 0) return [];

    const line = typical ?? median(bands.map(height));
    let joined = true;
    while (joined && bands.length > 1) {
      joined = false;
      const next: Band[] = [bands[0]!];
      for (const band of bands.slice(1)) {
        const last = next[next.length - 1]!;
        const gap = band.top - last.bottom;
        const thin = height(band) < 0.5 * line || height(last) < 0.5 * line;
        if (gap <= Math.max(1, 0.25 * line) || (thin && gap <= 0.9 * line)) {
          last.bottom = band.bottom;
          joined = true;
        } else {
          next.push({ ...band });
        }
      }
      bands = next;
    }
    return bands;
  }

  /** Columns from `left` to `right` that hold ink within the band. */
  columnInk(r: Region): number[] {
    const counts: number[] = [];
    for (let x = r.left; x < r.right; x++) {
      let n = 0;
      for (let y = r.top; y < r.bottom; y++) if (this.ink(x, y)) n++;
      counts.push(n);
    }
    return counts;
  }

  /**
   * The block split at its rightmost blank column gap, or null when it has none. Arabic text
   * stands at the right with the pictures to its left, so the rightmost gap separates them.
   */
  split(r: Region): [Region, Region] | null {
    const counts = this.columnInk(r);
    const minGap = Math.max(6, Math.round(0.015 * this.width));
    let gapEnd = -1;
    for (let i = counts.length - 1, seenInk = false; i >= 0; i--) {
      if (counts[i]! > 0) {
        if (gapEnd >= 0 && gapEnd - i >= minGap) {
          const cut = r.left + i + 1 + Math.floor((gapEnd - i) / 2);
          return [
            { ...r, right: cut },
            { ...r, left: cut },
          ];
        }
        seenInk = true;
        gapEnd = -1;
      } else if (seenInk && gapEnd < 0) {
        gapEnd = i;
      }
    }
    return null;
  }

  /**
   * Two lines touching through their diacritics: the band cut at its thinnest row (in its
   * middle part), when that row holds far less ink than a typical row of it.
   */
  valley(r: Region): [Region, Region] | null {
    const counts: number[] = [];
    for (let y = r.top; y < r.bottom; y++) {
      let n = 0;
      for (let x = r.left; x < r.right; x++) if (this.ink(x, y)) n++;
      counts.push(n);
    }
    const from = Math.floor(counts.length * 0.25);
    const to = Math.ceil(counts.length * 0.75);
    let cut = -1;
    for (let i = from; i < to; i++) if (cut < 0 || counts[i]! < counts[cut]!) cut = i;
    if (cut < 0 || counts[cut]! > 0.25 * median(counts)) return null;
    return [
      { ...r, bottom: r.top + cut },
      { ...r, top: r.top + cut + 1 },
    ];
  }

  /** The ink's horizontal extent within a band (within `r`). */
  extent(band: Band, r: Region): [number, number] | null {
    let left = r.right;
    let right = r.left - 1;
    for (let y = band.top; y < band.bottom; y++) {
      for (let x = r.left; x < r.right; x++) {
        if (this.ink(x, y)) {
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    return right < left ? null : [left, right + 1];
  }
}

/**
 * The lines on a page, top to bottom. `grey` holds one grey value (0–255) per pixel, row by
 * row, `width` × `height` of them (the page scaled down; a few hundred pixels wide is enough).
 */
export function detectLines(
  grey: ArrayLike<number>,
  width: number,
  pageHeight: number,
  options: LineDetectionOptions = {}
): Box[] {
  const o = { ...DEFAULTS, ...options };
  const page = new Page(
    withoutPictures(grey, width, pageHeight, o.inkBelow),
    width,
    pageHeight,
    o
  );
  const whole: Region = {
    left: Math.floor(width * o.margin),
    right: Math.ceil(width * (1 - o.margin)),
    top: Math.floor(pageHeight * o.margin),
    bottom: Math.ceil(pageHeight * (1 - Math.max(o.margin, o.footer))),
  };
  if (whole.right <= whole.left || whole.bottom <= whole.top) return [];

  const blocks = page.bands(whole);
  if (blocks.length === 0) return [];
  const line = lineHeight(blocks);
  const tall = (b: Band) => height(b) > 2.2 * line;

  const lines: Region[] = [];
  const search = (r: Region, bands: Band[], depth: number) => {
    for (const band of bands) {
      const block: Region = { ...r, top: band.top, bottom: band.bottom };
      if (!tall(band)) {
        if (height(band) >= Math.max(2, 0.35 * line)) lines.push(block);
        continue;
      }
      if (depth >= 6) continue;
      // Two lines joined across a small gap: band again, joining less.
      const again = page.bands(block, line);
      if (again.length > 1) {
        search(block, again, depth + 1);
        continue;
      }
      // Text beside a picture: split at the blank column gap and look on each side. What
      // cannot be split is a picture, not a line.
      const halves = page.split(block);
      if (halves) {
        for (const half of halves) search(half, page.bands(half, line), depth + 1);
        continue;
      }
      // Lines touching through their diacritics: cut at the thinnest row.
      const cut = page.valley(block);
      if (cut) {
        for (const part of cut) search(part, page.bands(part, line), depth + 1);
      }
    }
  };
  search(whole, blocks, 0);

  // Pieces of one row (split at a gap between words) become one line again.
  const pieces = lines
    .map((r) => ({ r, x: page.extent(r, r) }))
    .filter((l): l is { r: Region; x: [number, number] } => l.x !== null)
    .sort((a, b) => a.r.top - b.r.top || b.x[1] - a.x[1]);
  const rows: { r: Region; x: [number, number] }[] = [];
  for (const piece of pieces) {
    const last = rows[rows.length - 1];
    const overlap = last
      ? Math.min(last.r.bottom, piece.r.bottom) - Math.max(last.r.top, piece.r.top)
      : 0;
    if (last && overlap >= 0.6 * Math.min(height(last.r), height(piece.r))) {
      last.r = {
        ...last.r,
        top: Math.min(last.r.top, piece.r.top),
        bottom: Math.max(last.r.bottom, piece.r.bottom),
      };
      last.x = [Math.min(last.x[0], piece.x[0]), Math.max(last.x[1], piece.x[1])];
    } else {
      rows.push({ ...piece });
    }
  }

  // Captions side by side: a row with a wide blank stretch is two (or more) lines.
  const wideGap = Math.max(2.5 * line, 0.06 * width);
  const cut: { r: Region; x: [number, number] }[] = [];
  for (const row of rows) {
    const span: Region = { ...row.r, left: row.x[0], right: row.x[1] };
    const counts = page.columnInk(span);
    let from = 0;
    let blank = 0;
    for (let i = 0; i <= counts.length; i++) {
      if (i < counts.length && counts[i] === 0) {
        blank++;
        continue;
      }
      if (blank >= wideGap && i - blank > from) {
        cut.push({ r: row.r, x: [span.left + from, span.left + i - blank] });
        from = i;
      }
      blank = 0;
    }
    cut.push({ r: row.r, x: [span.left + from, span.right] });
  }
  cut.sort((a, b) => a.r.top - b.r.top || b.x[1] - a.x[1]);

  return cut.map(({ r, x }) => {
    const padX = width * 0.01;
    const padY = height(r) * 0.2;
    const l = Math.max(0, x[0] - padX);
    const right = Math.min(width, x[1] + padX);
    const t = Math.max(0, r.top - padY);
    const b = Math.min(pageHeight, r.bottom + padY);
    return [l / width, t / pageHeight, (right - l) / width, (b - t) / pageHeight].map(
      (v) => Math.round(v * 10000) / 10000
    ) as Box;
  });
}

/** Grey values of an image's pixels (luma), from RGBA canvas data. */
export function toGrey(rgba: ArrayLike<number>): Uint8ClampedArray {
  const grey = new Uint8ClampedArray(rgba.length / 4);
  for (let i = 0; i < grey.length; i++) {
    grey[i] = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
  }
  return grey;
}

/** Width the page is scaled to for detection: enough for lines, quick to scan. */
const DETECTION_WIDTH = 600;

/**
 * Loads a page image from archive.org with CORS and finds its lines. Fails (rejects) when the
 * image cannot be loaded or read.
 */
export async function detectLinesInImage(url: string): Promise<Box[]> {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = url;
  await image.decode();
  const scale = DETECTION_WIDTH / image.naturalWidth;
  const width = DETECTION_WIDTH;
  const h = Math.round(image.naturalHeight * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = h;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('canvas unavailable');
  context.drawImage(image, 0, 0, width, h);
  return detectLines(toGrey(context.getImageData(0, 0, width, h).data), width, h);
}
