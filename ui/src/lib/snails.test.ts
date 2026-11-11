import assert from 'node:assert/strict';
import { test } from 'node:test';
import { snailAt, snailsIn } from './snails.ts';

const MIN = 60_000;
const until = 1_000 * MIN; // the key ends here and lasts an hour; each snail walks a quarter of it
const at = (minutesIn: number) => snailAt(until, until - 60 * MIN + minutesIn * MIN, 60 * MIN, 15 * MIN);

test('a visit holds as many snails as it holds trails, rounded up', () => {
  assert.equal(snailsIn(60 * MIN, 15 * MIN), 4);
  assert.equal(snailsIn(30 * MIN, 15 * MIN), 2);
  assert.equal(snailsIn(40 * MIN, 15 * MIN), 3);
  assert.equal(snailsIn(5 * MIN, 15 * MIN), 1);
});

test('one after the other: the first walks the first quarter, then the second, and so on', () => {
  assert.deepEqual(at(0), { index: 0, of: 4, progress: 0 });
  assert.deepEqual(at(7.5), { index: 0, of: 4, progress: 0.5 });
  assert.deepEqual(at(15), { index: 1, of: 4, progress: 0 }); // the second starts as the first arrives
  assert.deepEqual(at(37.5), { index: 2, of: 4, progress: 0.5 });
  assert.equal(at(59)!.index, 3);
});

test('never two at once, and none when the key has ended', () => {
  assert.equal(at(60), undefined);
  assert.equal(at(75), undefined);
});

test('a clock that is behind puts the first at its departure', () => {
  assert.deepEqual(at(-5), { index: 0, of: 4, progress: 0 });
});

test('the last one walks only what is left, so that it arrives when the key ends', () => {
  const end = 1_000 * MIN;
  const visit = 40 * MIN; // 15 + 15 + 10
  const last = snailAt(end, end - 5 * MIN, visit, 15 * MIN)!;
  assert.deepEqual({ index: last.index, of: last.of, progress: last.progress }, { index: 2, of: 3, progress: 0.5 });
  assert.equal(snailAt(end, end - 1, visit, 15 * MIN)!.progress > 0.99, true);
});

test('no length known, no snail', () => {
  assert.equal(snailAt(until, until - MIN, 0, 15 * MIN), undefined);
  assert.equal(snailAt(until, until - MIN, 60 * MIN, 0), undefined);
});
