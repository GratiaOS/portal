import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SAY_FROM, minutesLeft } from './visit.ts';

test('minutes left are rounded up, never below 0, and unknown when the end is unknown', () => {
  const now = Date.parse('2026-11-10T10:00:00Z');
  assert.equal(minutesLeft(now + 10_000, now), 1);
  assert.equal(minutesLeft(now + 60_000, now), 1);
  assert.equal(minutesLeft(now + 61_000, now), 2);
  assert.equal(minutesLeft(now - 5_000, now), 0);
  assert.equal(minutesLeft(undefined, now), undefined);
  assert.equal(SAY_FROM, 10);
});
