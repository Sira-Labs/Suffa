import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTracks, trackKind } from './publisher-audio-index.mjs';

test('trackKind recognises every track type of the publisher index', () => {
  assert.equal(trackKind('الحوار الأول (أ)'), 'dialogue');
  assert.equal(trackKind('المفردات (العرض)'), 'vocabulary');
  assert.equal(trackKind('مفردات إضافية'), 'vocabulary');
  assert.equal(trackKind('التدريب (1) المثال'), 'exercise-example');
  assert.equal(trackKind('(1)التدريب'), 'exercise');
  assert.equal(trackKind('(2)فهم المسموع - التدريب'), 'listening');
  assert.equal(trackKind('(1)الأصوات - التدريب'), 'sounds');
  assert.equal(trackKind('السؤال (أ)'), 'exam');
  assert.equal(trackKind('شيء آخر'), 'other');
});

test('parseTracks takes number and title from the text before each link', () => {
  const html = `
    <li><span>01 الحوار الأول (أ)</span>
      <a href="http://old.arabicforall.net/sounds/1st_Audio_Book/unit01/lesson01/01.mp3">⬇</a></li>
    <li><span>03 المفردات (العرض)</span>
      <audio src="https://old.arabicforall.net/sounds/1st_Audio_Book/unit01/lesson01/03.mp3"></audio>
      <a href="https://old.arabicforall.net/sounds/1st_Audio_Book/unit01/lesson01/03.mp3">⬇</a></li>`;
  assert.deepEqual(parseTracks(html), [
    {
      n: 1,
      title: 'الحوار الأول (أ)',
      kind: 'dialogue',
      url: 'https://old.arabicforall.net/sounds/1st_Audio_Book/unit01/lesson01/01.mp3',
    },
    {
      n: 3,
      title: 'المفردات (العرض)',
      kind: 'vocabulary',
      url: 'https://old.arabicforall.net/sounds/1st_Audio_Book/unit01/lesson01/03.mp3',
    },
  ]);
});

test('parseTracks drops links into another unit (publisher page mistake)', () => {
  const html = `
    <span>01 الحوار الثاني</span><a href="https://old.arabicforall.net/sounds/1st_Audio_Book/unit14/lesson119/01.mp3">x</a>
    <span>01 (1)الأصوات - التدريب</span><a href="https://old.arabicforall.net/sounds/1st_Audio_Book/unit12/lesson105/01.mp3">x</a>`;
  assert.deepEqual(
    parseTracks(html, 12).map((t) => t.url),
    ['https://old.arabicforall.net/sounds/1st_Audio_Book/unit12/lesson105/01.mp3']
  );
  assert.equal(parseTracks(html).length, 2);
});
