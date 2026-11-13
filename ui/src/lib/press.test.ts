import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HOLD_MS, MAX_HOLD_MS, Press } from './press.ts';

test('a short press is a tap: down, and then a tap when it ends; nothing else', () => {
  const p = new Press();
  assert.deepEqual(p.down(0), ['down']);
  assert.deepEqual(p.tick(HOLD_MS - 1), []);
  assert.deepEqual(p.up(HOLD_MS - 1), ['tap']);
  assert.equal(p.pressing, false);
});

test('a long press is a hold once it has lasted long enough, and a release when it ends', () => {
  const p = new Press();
  p.down(1_000);
  assert.deepEqual(p.tick(1_000 + HOLD_MS - 1), []);
  assert.deepEqual(p.tick(1_000 + HOLD_MS), ['hold']);
  assert.equal(p.holding, true);
  assert.deepEqual(p.tick(1_000 + HOLD_MS + 10), []); // it is said once
  assert.deepEqual(p.up(3_000), ['release']);
  assert.equal(p.holding, false);
  assert.equal(p.pressing, false);
});

test('an end with no press is nothing, and a time with no press is nothing', () => {
  const p = new Press();
  assert.deepEqual(p.up(0), []);
  assert.deepEqual(p.tick(99_999), []);
});

test('an end that never came does not leave it stuck: a hold lets itself go after the longest it is let last', () => {
  const p = new Press();
  p.down(0);
  p.tick(HOLD_MS); // a hold
  assert.deepEqual(p.tick(HOLD_MS + MAX_HOLD_MS - 1), []);
  assert.deepEqual(p.tick(HOLD_MS + MAX_HOLD_MS), ['release']);
  assert.equal(p.pressing, false);
  assert.equal(p.holding, false);
  // and the next press is a press like any other
  assert.deepEqual(p.down(60_000), ['down']);
  assert.deepEqual(p.up(60_100), ['tap']);
});

test('a new press while one is still down ends the old one first, so it cannot be ignored for ever', () => {
  const p = new Press();
  p.down(0);
  p.tick(HOLD_MS); // held, and its end was lost
  assert.deepEqual(p.down(5_000), ['release', 'down']); // the old one ends as a release, the new one begins
  assert.equal(p.pressing, true);
  assert.equal(p.holding, false); // the new one is not yet a hold
  assert.deepEqual(p.up(5_050), ['tap']);

  // the same for a press that was only a touch and never ended
  const q = new Press();
  q.down(0);
  assert.deepEqual(q.down(1_000), ['tap', 'down']);
});

test('whatever ends it ends it the same way, and twice is fine', () => {
  const p = new Press();
  p.down(0);
  p.tick(HOLD_MS);
  assert.deepEqual(p.up(2_000), ['release']);
  assert.deepEqual(p.up(2_001), []);
});
