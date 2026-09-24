import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lemmaKey, normalize, stems, tokenize } from './tatoeba-examples.mjs';

test('normalize drops tashkil and folds letter variants', () => {
  assert.equal(normalize('مَدْرَسَةٌ'), 'مدرسه');
  assert.equal(normalize('إِلى'), 'الي');
});

test('tokenize splits on punctuation and keeps Arabic words only', () => {
  assert.deepEqual(tokenize('هٰذا كِتابٌ، يا أَحْمَدُ!'), ['هذا', 'كتاب', 'يا', 'احمد']);
});

test('stems strip clitics and possessive endings', () => {
  assert.ok(stems('والبيت').has('بيت'));
  assert.ok(stems('بيتي').has('بيت'));
  assert.ok(stems('غرفتي').has('غرفه'));
  assert.ok(stems('مدرستها').has('مدرسه'));
});

test('lemmaKey removes the article and skips phrases', () => {
  assert.equal(lemmaKey('السَّلام'), 'سلام');
  assert.equal(lemmaKey('مَعَ السَّلامَة'), null);
});
