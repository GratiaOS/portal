import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IDLE_MS, isIdle } from './idle.ts';

test('idle: a minute with nothing done, and not a second before', () => {
  assert.equal(IDLE_MS, 60_000);
  assert.equal(isIdle(1_000, 1_000 + 59_999), false);
  assert.equal(isIdle(1_000, 1_000 + 60_000), true);
  assert.equal(isIdle(1_000, 1_000 + 300_000), true);
  assert.equal(isIdle(5_000, 5_000, 10), false); // just touched
  assert.equal(isIdle(5_000, 5_020, 10), true); // another threshold
});
