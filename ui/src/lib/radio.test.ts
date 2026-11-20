import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BAND, DRIFT_MAX_S, TAPE_URL, cameRound, driftFrom, rejoinTarget, tapeAddress, tapePositionAt } from './radio.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

test('the clock: the tape is where the epoch says, round and round', () => {
  near(tapePositionAt(0, 100), 0);
  near(tapePositionAt(25_000, 100), 25);
  near(tapePositionAt(100_000, 100), 0);
  near(tapePositionAt(1_700_000_000_000 + 30_500, 100), tapePositionAt(1_700_000_000_000 + 30_500 + 100_000 * 7, 100));
  assert.ok(tapePositionAt(1_700_000_012_345, 61.5) < 61.5);
});

test('the clock: no length, no position; a time before the epoch still lands inside the tape', () => {
  assert.equal(tapePositionAt(123_456, 0), 0);
  assert.equal(tapePositionAt(123_456, NaN), 0);
  assert.equal(tapePositionAt(123_456, Infinity), 0);
  const p = tapePositionAt(-30_000, 100);
  assert.ok(p >= 0 && p < 100);
  near(p, 70);
});

test('drift: the shortest way round, positive when the tape is behind', () => {
  near(driftFrom(50_000, 49, 100), 1);
  near(driftFrom(50_000, 52, 100), -2);
  near(driftFrom(1_000, 99, 100), 2); // the clock just came round, the tape has not
  near(driftFrom(99_000, 1, 100), -2); // the tape came round, the clock has not
  assert.equal(driftFrom(50_000, 10, 0), 0);
});

test('the guarded re-join: near the clock it is left alone, far from it it goes where the clock says', () => {
  assert.equal(rejoinTarget(50_000, 50.1, 100), null);
  assert.equal(rejoinTarget(50_000, 49.8, 100), null);
  assert.equal(rejoinTarget(50_000, 50 - DRIFT_MAX_S - 0.01, 100), 50);
  assert.equal(rejoinTarget(50_000, 53, 100), 50);
  assert.equal(rejoinTarget(50_000, 50.2, 100, 0.1), 50);
  assert.equal(rejoinTarget(50_000, 50.05, 100, 0.1), null);
  assert.equal(rejoinTarget(100, 99.9, 100), null); // across the seam, 0.2 s apart: the same second
  assert.equal(rejoinTarget(1_000, 99.5, 100), 1); // across the seam, 1.5 s apart: put back
  assert.equal(rejoinTarget(50_000, 10, NaN), null); // length not known: nothing to put it back on
});

test('a tape has come round when its time went back by more than a jitter', () => {
  assert.equal(cameRound(99.9, 0.1), true);
  assert.equal(cameRound(10, 9.8), false);
  assert.equal(cameRound(10, 11), false);
});

test('a new address on every load, on the band and nowhere else', () => {
  assert.equal(TAPE_URL, `${BAND}/tape`);
  assert.equal(BAND, 'https://amigo-fm.gratia.workers.dev');
  const a = tapeAddress(1_700_000_000_000);
  const b = tapeAddress(1_700_000_000_001);
  assert.notEqual(a, b);
  assert.ok(a.startsWith(`${TAPE_URL}?`));
  assert.equal(new URL(a).origin, BAND);
});
