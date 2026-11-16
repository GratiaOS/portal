import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seenWindow } from './window.ts';

test('window: the whole window is seen, so the room is left where it is', () => {
  assert.equal(seenWindow({ height: 812, offsetTop: 0, scale: 1 }, 812), undefined);
  assert.equal(seenWindow({ height: 811.6, offsetTop: 0, scale: 1 }, 812), undefined); // a rounding of the browser, not a keyboard
});

test('window: a keyboard covers the lower part, so the room is the part above it', () => {
  assert.deepEqual(seenWindow({ height: 476, offsetTop: 0, scale: 1 }, 812), { top: 0, height: 476 });
  // iOS also moves what is seen down the page to show the box: the room follows it
  assert.deepEqual(seenWindow({ height: 476.4, offsetTop: 120.5, scale: 1 }, 812), { top: 121, height: 476 });
  assert.deepEqual(seenWindow({ height: 476, offsetTop: -3, scale: 1 }, 812), { top: 0, height: 476 }); // a bounce past the top
});

test('window: a page zoomed by hand is left alone', () => {
  assert.equal(seenWindow({ height: 406, offsetTop: 200, scale: 2 }, 812), undefined);
});
