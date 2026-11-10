import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fadeOf, inTrail, opacityOf, FLOOR } from './trail.ts';

const MIN = 60_000;
const NOW = Date.parse('2026-11-10T10:00:00Z');
const ago = (minutes: number) => new Date(NOW - minutes * MIN).toISOString();

test('a turn is in the trail for as long as it is younger than the trail', () => {
  assert.equal(inTrail(ago(14.9), 15 * MIN, NOW), true);
  assert.equal(inTrail(ago(15), 15 * MIN, NOW), false);
});

test('what was just said is as it was said, and what is about to go is a trace', () => {
  assert.equal(opacityOf(fadeOf(ago(0), 15 * MIN, NOW, 0)), 1);
  assert.equal(opacityOf(fadeOf(ago(0), 15 * MIN, NOW, 40)), 1, 'distance alone never dims what is new');
  assert.ok(opacityOf(fadeOf(ago(14.99), 15 * MIN, NOW, 20)) <= FLOOR + 0.02);
});

test('the older a turn, the fainter; and at the same age, the further from the newest, the fainter', () => {
  const at = (m: number, place = 0) => opacityOf(fadeOf(ago(m), 15 * MIN, NOW, place));
  assert.ok(at(3) > at(8) && at(8) > at(13));
  assert.ok(at(8, 0) > at(8, 12));
});

test('a clock that is behind the turn does not brighten it past what it was', () => {
  assert.equal(opacityOf(fadeOf(ago(-5), 15 * MIN, NOW, 0)), 1);
});
