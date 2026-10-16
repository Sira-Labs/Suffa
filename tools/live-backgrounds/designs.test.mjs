import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DESIGNS, HEIGHT, WIDTH } from './designs.mjs';

test('every background is a self-contained SVG of the room size', () => {
  assert.deepEqual(Object.keys(DESIGNS).sort(), ['arches', 'lattice', 'mosque', 'stars']);
  for (const [id, draw] of Object.entries(DESIGNS)) {
    const svg = draw();
    assert.match(svg, new RegExp(`^<svg [^>]*width="${WIDTH}" height="${HEIGHT}"`), id);
    // Our own drawings only: no text, no embedded or linked pictures.
    assert.doesNotMatch(svg, /<text|<image|href=|NaN/, id);
  }
});
