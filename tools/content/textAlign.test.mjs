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

test('a line repeated with small differences starts at its first reading', () => {
  const times = lineTimes(
    ['هذا مسجد', 'هذا باب'],
    words(
      ['هذا', 1],
      ['مسجد', 2],
      ['هذا', 4],
      ['مسجد', 5],
      ['هذا', 8],
      ['بابن', 9], // first reading, recognised a little off
      ['هذا', 12],
      ['باب', 13],
      ['هذا', 16],
      ['باب', 17]
    )
  );
  assert.equal(times[0].start, 1);
  assert.equal(times[1].start, 8);
});

test('a line the alignment gave away is found again between its neighbours', () => {
  const times = lineTimes(
    ['هذا طبيب', 'سد إ وَلَدْ :', 'أهذا ولد ؟'],
    words(['هذا', 1], ['طبيب', 2], ['هذا', 5], ['ولد', 6], ['أهذا', 9], ['ولد', 10])
  );
  assert.equal(times[0].start, 1);
  assert.ok(times[1] && times[1].start >= 5 && times[1].start < 9);
  assert.equal(times[2].start, 9);
});

test('a page read column by column: lines are found in the order they are said', () => {
  const times = lineTimes(
    ['من هذا ؟', 'من هذا ؟', 'هذا طبيب', 'هذا ولد', 'من هذا ؟', 'هذا طالب'],
    words(
      ['من', 1],
      ['هذا', 2],
      ['هذا', 3],
      ['طبيب', 4],
      ['من', 6],
      ['هذا', 7],
      ['هذا', 8],
      ['طالب', 9],
      ['من', 11],
      ['هذا', 12],
      ['هذا', 13],
      ['ولد', 14]
    ),
    { pages: [6, 6, 6, 6, 6, 6] }
  );
  assert.equal(times[2].start, 3); // طبيب
  assert.equal(times[5].start, 8); // طالب, read before ولد
  assert.equal(times[3].start, 13); // ولد, listed before طالب
});

test('lines that sound alike keep their reading order', () => {
  const times = lineTimes(
    ['هذا حمار', 'أهذا حمار ؟', 'لا هذا حصان'],
    words(
      ['هذا', 1],
      ['حمار', 2],
      ['هذا', 5],
      ['حمار', 6],
      ['لا', 8],
      ['هذا', 9],
      ['حصان', 10]
    ),
    { pages: [7, 7, 7] }
  );
  assert.ok(times[0].start < times[1].start);
  assert.equal(times[0].start, 1);
  assert.equal(times[2].start, 8);
});

test('a line taken by a later sentence that sounds alike moves back between its neighbours', () => {
  const times = lineTimes(
    ['ما هذا ؟', 'هذا بك', 'من هذا ؟', 'هذا مدرس', 'أهذا ديك ؟ نعم'],
    words(
      ['ما', 1],
      ['هذا', 2],
      ['هذا', 3],
      ['ديك', 4],
      ['من', 7],
      ['هذا', 8],
      ['هذا', 9],
      ['مدرس', 10],
      ['أهذا', 20],
      ['ديك', 21],
      ['نعم', 22]
    ),
    { pages: [8, 8, 8, 8, 8] }
  );
  assert.equal(times[1].start, 3);
  assert.equal(times[4].start, 20);
});
