import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeBubbles } from './bubbles.ts';

test('the same seed gives the same bubbles, another seed gives others', () => {
  assert.deepEqual(makeBubbles(16, 7), makeBubbles(16, 7));
  assert.notDeepEqual(makeBubbles(16, 7), makeBubbles(16, 8));
});

test('as many as asked, each within what keeps the page calm: small, slow, spread, and never a number that is not one', () => {
  const bubbles = makeBubbles(40, 3);
  assert.equal(bubbles.length, 40);
  for (const b of bubbles) {
    assert.ok(b.left >= 0 && b.left <= 100, `left ${b.left}`);
    assert.ok(b.size >= 4 && b.size <= 22, `size ${b.size}`);
    assert.ok(b.delay >= -20 && b.delay <= 0, `delay ${b.delay}`);
    assert.ok(b.duration >= 10 && b.duration <= 28, `duration ${b.duration}`);
    assert.ok(b.drift >= -24 && b.drift <= 24, `drift ${b.drift}`);
    assert.ok(b.opacity >= 0.45 && b.opacity <= 0.85, `opacity ${b.opacity}`);
    for (const v of Object.values(b)) assert.ok(Number.isFinite(v));
  }
  assert.deepEqual(makeBubbles(0), []);
});

test('a bubble of oxygen rises faster the bigger it is: the big ones take about half the time of the small ones', () => {
  const bubbles = makeBubbles(200, 5);
  const average = (list: number[]) => list.reduce((a, b) => a + b, 0) / list.length;
  const small = bubbles.filter((b) => b.size <= 8).map((b) => b.duration);
  const big = bubbles.filter((b) => b.size >= 18).map((b) => b.duration);
  assert.ok(small.length > 10 && big.length > 10, 'both kinds are there');
  assert.ok(average(big) < average(small) * 0.65, `big ${average(big)}, small ${average(small)}`);
});

test('they are spread over the page and over time, not stacked in one place', () => {
  const bubbles = makeBubbles(16, 7);
  assert.ok(new Set(bubbles.map((b) => Math.floor(b.left / 25))).size >= 3); // at least three of the four quarters
  assert.ok(new Set(bubbles.map((b) => b.delay)).size >= 12); // not all starting together
});
