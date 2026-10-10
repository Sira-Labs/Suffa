import assert from 'node:assert/strict';
import { test } from 'node:test';
import { align, lessonPages, readable } from './madinah-book-sync.mjs';

test('a lesson runs from its page to the page before the next lesson', () => {
  const book = {
    pages: 20,
    lessons: [
      { lesson: 1, page: 2 },
      { lesson: 2, page: 9 },
    ],
  };
  assert.deepEqual(lessonPages(book, book.lessons[0]), [2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(
    lessonPages(book, book.lessons[1]),
    [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]
  );
});

test('specks and the centred page number are not read', () => {
  assert.equal(readable([0.1, 0.2, 0.8, 0.04]), true);
  assert.equal(readable([0.45, 0.8, 0.1, 0.02]), false);
  assert.equal(readable([0.1, 0.2, 0.02, 0.04]), false);
  // A short line at the bottom that is not centred is text.
  assert.equal(readable([0.7, 0.8, 0.1, 0.03]), true);
});

test('lines are paired with speech in reading order, page turns follow', () => {
  const { pages, lines } = align(
    [
      {
        page: 2,
        boxes: [
          [0.1, 0.3, 0.8, 0.04],
          [0.1, 0.1, 0.8, 0.04],
        ],
      },
      { page: 3, boxes: [[0.1, 0.1, 0.8, 0.04]] },
    ],
    [
      { start: 1, end: 3 },
      { start: 4, end: 6 },
      { start: 8, end: 9.5 },
    ]
  );
  assert.deepEqual(
    lines.map((l) => [l.page, l.box[1], l.start, l.end]),
    [
      [2, 0.1, 1, 3],
      [2, 0.3, 4, 6],
      [3, 0.1, 8, 9.5],
    ]
  );
  assert.deepEqual(pages, [
    { page: 2, at: 0 },
    { page: 3, at: 8 },
  ]);
});

test('nothing is paired without speech', () => {
  assert.deepEqual(align([{ page: 2, boxes: [[0.1, 0.1, 0.8, 0.04]] }], []), {
    pages: [],
    lines: [],
  });
});
