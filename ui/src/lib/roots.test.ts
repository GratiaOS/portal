import assert from 'node:assert/strict';
import { test } from 'node:test';
import { growRoots, seeded } from './roots.ts';

const foot = { x: 300, y: 200 };
const targets = [
  { x: 100, y: 420 },
  { x: 300, y: 380 },
  { x: 520, y: 430 },
];

test('the same gate has the same roots: a seed gives the same numbers, another gives others', () => {
  const a = seeded(1);
  const b = seeded(1);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.notEqual(seeded(1)(), seeded(2)());
  assert.deepEqual(growRoots(foot, targets, 7), growRoots(foot, targets, 7));
  assert.notDeepEqual(growRoots(foot, targets, 7), growRoots(foot, targets, 8));
});

test('a root to each light and two forks from each: the root first, leaving the foot and arriving at its light', () => {
  const paths = growRoots(foot, targets);
  assert.equal(paths.length, targets.length * 3);
  targets.forEach((target, i) => {
    const root = paths[i * 3]!;
    assert.ok(root.startsWith('M300 200 C'), root);
    assert.ok(root.endsWith(`${target.x} ${target.y}`), root);
    assert.match(paths[i * 3 + 1]!, /^M[\d.]+ [\d.]+ Q/);
    assert.match(paths[i * 3 + 2]!, /^M[\d.]+ [\d.]+ Q/);
  });
});

test('a fork leaves from the root it belongs to, not from the foot', () => {
  const [root, fork] = growRoots(foot, [targets[0]!]);
  assert.ok(!fork!.startsWith('M300 200'));
  assert.ok(root !== fork);
});

test('there is always a path with numbers in it, even for a light at the foot itself, and none for no light', () => {
  const same = growRoots(foot, [foot]);
  assert.equal(same.length, 3);
  assert.ok(same.every((d) => !/NaN|Infinity/.test(d)));
  assert.deepEqual(growRoots(foot, []), []);
});
