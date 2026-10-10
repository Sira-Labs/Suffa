import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alignLetters, letters, lineTimes } from './textAlign.mjs';

const words = (...list) => list.map(([w, s]) => ({ w, s, e: s + 0.8 }));

test('only the bare letters count: marks, tatweel, spaces and digits go, hamza seats fold', () => {
  assert.equal(letters('هَـٰذَا بَيْتٌ.'), 'هذابيت');
  assert.equal(letters('(1) أَهَذا كُرْسِيٌّ ؟'), 'اهذاكرسي');
  assert.equal(letters('مَدْرَسَة'), 'مدرسه');
  assert.equal(letters('abc 12'), '');
});

test('letters are matched in order, extra speech in between is passed over', () => {
  const speech = `سab${'س'.repeat(30)}ت`.replace('a', 'ا').replace('b', 'ب');
  assert.deepEqual([...alignLetters('ابت', speech)], [1, 2, speech.length - 1]);
});

test('each line starts when its letters are first said; repeats and announcements are passed over', () => {
  const times = lineTimes(
    ['هَذَا بَيْتٌ', 'هَذَا مَسْجِدٌ', 'هَذَا قَلَمٌ'],
    words(
      ['الدرس', 0],
      ['الأول', 1],
      ['هذا', 3],
      ['بيت', 4],
      ['هذا', 5],
      ['بيت', 6],
      ['هذا', 8],
      ['مسجد', 9],
      ['التمرين', 11],
      ['هذا', 13],
      ['قلم', 14]
    )
  );
  assert.equal(times[0].start, 3);
  assert.equal(times[1].start, 8);
  assert.equal(times[2].start, 13);
});

test('OCR noise is tolerated, but a line that is never heard has no time', () => {
  const times = lineTimes(
    ['هنذا بيت :', '0 ) ا 8 : ٢ إ:', 'هذا قلم'],
    words(['هذا', 3], ['بيت', 4], ['هذا', 8], ['قلم', 9])
  );
  assert.equal(times[0].start, 3);
  assert.equal(times[1], null);
  assert.equal(times[2].start, 8);
});
