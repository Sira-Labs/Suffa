import { describe, expect, it } from 'vitest';
import { detectLines, toGrey } from './lineDetection';

/** A white page with black bars (text lines) at the given rows and columns. */
function page(
  width: number,
  height: number,
  bars: { top: number; bottom: number; left: number; right: number }[]
): Uint8ClampedArray {
  const grey = new Uint8ClampedArray(width * height).fill(255);
  for (const bar of bars) {
    for (let y = bar.top; y < bar.bottom; y++) {
      // Text is not solid: every other pixel is ink.
      for (let x = bar.left; x < bar.right; x += 2) grey[y * width + x] = 0;
    }
  }
  return grey;
}

describe('line detection', () => {
  it('finds each text line as a box, top to bottom', () => {
    const grey = page(200, 400, [
      { top: 40, bottom: 52, left: 20, right: 180 },
      { top: 80, bottom: 92, left: 60, right: 180 },
      { top: 120, bottom: 132, left: 20, right: 120 },
    ]);
    const boxes = detectLines(grey, 200, 400);
    expect(boxes).toHaveLength(3);
    const [first, second, third] = boxes;
    // Within a little padding of the bars.
    expect(first![1]).toBeCloseTo(40 / 400, 1);
    expect(second![0]).toBeGreaterThan(0.25);
    expect(third![0] + third![2]).toBeLessThan(0.65);
    expect(
      boxes.every(([x, y, w, h]) => x >= 0 && y >= 0 && x + w <= 1 && y + h <= 1)
    ).toBe(true);
  });

  it('joins diacritics above and below a line to it', () => {
    const grey = page(200, 300, [
      { top: 50, bottom: 53, left: 40, right: 160 }, // fatha marks
      { top: 56, bottom: 68, left: 20, right: 180 }, // the letters
      { top: 71, bottom: 73, left: 40, right: 160 }, // kasra marks
      { top: 110, bottom: 122, left: 20, right: 180 },
    ]);
    const boxes = detectLines(grey, 200, 300);
    expect(boxes).toHaveLength(2);
    expect(boxes[0]![1]).toBeLessThan(50 / 300);
    expect(boxes[0]![1] + boxes[0]![3]).toBeGreaterThan(73 / 300);
  });

  it('leaves out scan edges, the footer line and specks', () => {
    const grey = page(200, 400, [
      { top: 0, bottom: 400, left: 0, right: 3 }, // dark scan edge
      { top: 100, bottom: 112, left: 20, right: 180 },
      { top: 200, bottom: 201, left: 100, right: 102 }, // a speck
      { top: 388, bottom: 396, left: 20, right: 180 }, // copyright footer
    ]);
    expect(detectLines(grey, 200, 400)).toHaveLength(1);
  });

  it('finds the lines beside a picture and leaves the picture out', () => {
    const grey = page(300, 400, [
      { top: 20, bottom: 32, left: 20, right: 280 },
      { top: 50, bottom: 200, left: 20, right: 140 }, // a picture
      { top: 60, bottom: 72, left: 170, right: 280 },
      { top: 100, bottom: 112, left: 170, right: 280 },
      { top: 230, bottom: 242, left: 20, right: 280 },
      { top: 260, bottom: 272, left: 20, right: 280 },
    ]);
    const boxes = detectLines(grey, 300, 400);
    expect(boxes).toHaveLength(5);
    expect(boxes.slice(1, 3).every(([x]) => x > 0.5)).toBe(true);
    expect(boxes.every(([, , , h]) => h < 0.1)).toBe(true);
  });

  it('leaves out a picture that reaches into the rows and columns of the text', () => {
    const grey = page(300, 400, [
      { top: 50, bottom: 150, left: 20, right: 140 }, // a horse's body
      { top: 150, bottom: 200, left: 20, right: 200 }, // its legs, under the text
      { top: 60, bottom: 72, left: 160, right: 280 },
      { top: 100, bottom: 112, left: 160, right: 280 },
      { top: 230, bottom: 242, left: 20, right: 280 },
    ]);
    const boxes = detectLines(grey, 300, 400);
    expect(boxes).toHaveLength(3);
    expect(boxes.slice(0, 2).every(([x]) => x > 0.5)).toBe(true);
    expect(boxes.every(([, , , h]) => h < 0.1)).toBe(true);
  });

  it('cuts captions side by side into lines of their own, right to left', () => {
    const grey = page(400, 300, [
      { top: 100, bottom: 112, left: 20, right: 100 },
      { top: 100, bottom: 112, left: 160, right: 240 },
      { top: 100, bottom: 112, left: 300, right: 380 },
    ]);
    const boxes = detectLines(grey, 400, 300);
    expect(boxes).toHaveLength(3);
    expect(boxes.map(([x]) => x > 0.7)).toEqual([true, false, false]);
    expect(boxes[2]![0]).toBeLessThan(0.1);
  });

  it('finds nothing on a blank page', () => {
    expect(detectLines(new Uint8ClampedArray(100 * 100).fill(250), 100, 100)).toEqual([]);
  });

  it('turns RGBA pixels into grey values', () => {
    expect([...toGrey([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255])]).toEqual([
      255, 0, 76,
    ]);
  });
});
