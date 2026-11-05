import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_CHARS, boxHeight, counter, sendsOnEnter } from './composer.ts';

const key = (over: Partial<{ key: string; shiftKey: boolean; isComposing: boolean }> = {}) => ({ key: 'Enter', shiftKey: false, isComposing: false, ...over });

test('Enter sends with a keyboard, and breaks the line on a touch screen', () => {
  assert.equal(sendsOnEnter(key(), true), true);
  assert.equal(sendsOnEnter(key(), false), false); // the button sends there
  assert.equal(sendsOnEnter(key({ shiftKey: true }), true), false);
  assert.equal(sendsOnEnter(key({ isComposing: true }), true), false); // an input method is still choosing a character
  assert.equal(sendsOnEnter(key({ key: 'a' }), true), false);
});

test('the box grows with the text up to two fifths of the window, and no less than 120 and no more than 320 px', () => {
  assert.equal(boxHeight(48, 900), 48); // what the text needs
  assert.equal(boxHeight(1000, 900), 320); // a tall window: the most
  assert.equal(boxHeight(1000, 600), 240); // two fifths
  assert.equal(boxHeight(1000, 200), 120); // a window so low that the box still shows a few lines
  assert.equal(boxHeight(100, 200), 100);
});

test('the count shows only near the limit, as how far and of how much', () => {
  assert.equal(counter(0), undefined);
  assert.equal(counter(MAX_CHARS * 0.9 - 1), undefined);
  assert.equal(counter(3600), '3600 / 4000');
  assert.equal(counter(MAX_CHARS), '4000 / 4000');
});
