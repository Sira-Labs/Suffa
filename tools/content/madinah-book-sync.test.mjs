import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lessonPages, readable, timedSync } from './madinah-book-sync.mjs';

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

const box = (y) => [0.1, y, 0.8, 0.04];

test('heard lines are kept in order; each holds until the next unless that is far off', () => {
  const { pages, lines } = timedSync(
    [
      { page: 2, box: box(0.1) },
      { page: 2, box: box(0.2) }, // a picture: never heard
      { page: 2, box: box(0.3) },
      { page: 3, box: box(0.1) },
      { page: 3, box: box(0.2) }, // found before the line above it: a misreading
    ],
    [
      { start: 1, end: 3 },
      null,
      { start: 4, end: 6 },
      { start: 20, end: 21 },
      { start: 10, end: 11 },
    ]
  );
  assert.deepEqual(
    lines.map((l) => [l.page, l.box[1], l.start, l.end]),
    [
      [2, 0.1, 1, 4],
      [2, 0.3, 4, 7.5],
      [3, 0.1, 20, 22.5],
    ]
  );
  assert.deepEqual(pages, [
    { page: 2, at: 0 },
    { page: 3, at: 20 },
  ]);
});

test('nothing heard, nothing suggested', () => {
  assert.deepEqual(timedSync([{ page: 2, box: box(0.1) }], [null]), {
    pages: [],
    lines: [],
  });
});
