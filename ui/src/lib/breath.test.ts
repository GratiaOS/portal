import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BREATHS_PER_MINUTE, CYCLE_MS, breathAt } from './breath.ts';

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);

test('eight a minute: a breath is seven and a half seconds', () => {
  assert.equal(BREATHS_PER_MINUTE, 8);
  assert.equal(CYCLE_MS, 7_500);
});

test('closed at the instant the epoch began, open half a breath later, closed again after a whole one', () => {
  near(breathAt(0), -1);
  near(breathAt(CYCLE_MS / 2), 1);
  near(breathAt(CYCLE_MS), -1);
  near(breathAt(CYCLE_MS / 4), 0);
});

test('it never leaves what it is: between closed and open, and always a number', () => {
  for (let t = 1_700_000_000_000; t < 1_700_000_000_000 + 3 * CYCLE_MS; t += 37) {
    const v = breathAt(t);
    assert.ok(v >= -1 - 1e-12 && v <= 1 + 1e-12 && Number.isFinite(v));
  }
});

test('the same instant is the same pulse, whatever the day: a whole number of breaths later is the same breath', () => {
  const now = 1_763_000_000_000;
  for (const k of [1, 2, 11, 1000, 11520]) near(breathAt(now), breathAt(now + k * CYCLE_MS), 1e-6);
});

test('two people who open the gate together see the same breath: devices a moment apart are a moment apart in the wave, and no more', () => {
  const now = 1_763_000_123_456;
  // clocks that differ by a twentieth of a second differ by at most the steepest the wave goes in that time: about four hundredths
  assert.ok(Math.abs(breathAt(now) - breathAt(now + 50)) <= (2 * Math.PI * 50) / CYCLE_MS + 1e-9);
  // and by a whole breath, by nothing at all
  near(breathAt(now), breathAt(now + CYCLE_MS), 1e-6);
});

test('it is smooth: no step between one moment and the next, at any point of the wave', () => {
  let last = breathAt(0);
  for (let t = 16; t <= 2 * CYCLE_MS; t += 16) {
    const v = breathAt(t);
    assert.ok(Math.abs(v - last) < 0.02, `a step of ${Math.abs(v - last)} at ${t}`);
    last = v;
  }
});

test('a clock before the epoch is still a breath', () => {
  near(breathAt(-CYCLE_MS / 2), 1);
  near(breathAt(-CYCLE_MS), -1);
});
