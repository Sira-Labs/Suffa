import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pageOf, parseEntries, toVideos } from './publisher-video-index.mjs';

test('pageOf reads the page from every title style of the playlist', () => {
  assert.equal(pageOf('Arabic course - Book 1 :Page 28 - At Your Hands'), 28);
  assert.equal(pageOf('Arabic at Your Hands - Book 1: Page 11 - Greetings'), 11);
  assert.equal(pageOf('Al-Arabiyyah Bayna Yadayk Course - Book 1: Page 245'), 245);
  assert.equal(
    pageOf('Arabic Course - Book 3: Page 124 - Al-Arabiyyah Bayna Yadayk'),
    null
  );
  assert.equal(pageOf('Arabic at Your Hands - Book 1: Lesson 12'), null);
});

test('parseEntries collects lockups and only the first continuation token', () => {
  const data = {
    contents: [
      {
        lockupViewModel: {
          contentId: 'a',
          metadata: { lockupMetadataViewModel: { title: { content: 'Book 1: Page 3' } } },
        },
      },
      { continuationItemViewModel: { continuationCommand: { token: 'playlist' } } },
    ],
    comments: { continuationCommand: { token: 'comments' } },
  };
  assert.deepEqual(parseEntries(data), {
    entries: [{ id: 'a', title: 'Book 1: Page 3' }],
    continuation: 'playlist',
  });
});

test('toVideos sorts by page, drops other books and places page-less videos between neighbours', () => {
  const videos = toVideos([
    { id: 'p33', title: 'Book 1: Page 33' },
    { id: 'p31', title: 'Book 1: Page 31' },
    { id: 'l12', title: 'Book 1: Lesson 12' },
    { id: 'p35', title: 'Book 1: Page 35' },
    { id: 'b3', title: 'Book 3: Page 124' },
  ]);
  assert.deepEqual(
    videos.map((v) => [v.id, v.page, v.approx ?? false]),
    [
      ['p31', 31, false],
      ['p33', 33, false],
      ['l12', 33, true],
      ['p35', 35, false],
    ]
  );
});
