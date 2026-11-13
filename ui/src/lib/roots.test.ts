import assert from 'node:assert/strict';
import { test } from 'node:test';
import { growRoots, seeded } from './roots.ts';

const foot = { x: 300, y: 200 };
const REACH = 100;

/** Every point a path names, whether it is on the curve or only a handle: all stay inside what the roots may be. */
const points = (d: string): { x: number; y: number }[] => {
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const out = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i]!, y: nums[i + 1]! });
  return out;
};

test('the same gate has the same roots: a seed gives the same numbers, another gives others', () => {
  const a = seeded(1);
  const b = seeded(1);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.notEqual(seeded(1)(), seeded(2)());
  assert.deepEqual(growRoots(foot, REACH, 7), growRoots(foot, REACH, 7));
  assert.notDeepEqual(growRoots(foot, REACH, 7), growRoots(foot, REACH, 8));
});

test('the roots of a tree: a taproot, two lateral roots, four going down and out, and their forks', () => {
  const paths = growRoots(foot, REACH);
  // seven roots: six with two levels of forks (ten paths each) and the taproot with one (three), sixty-three in all
  assert.equal(paths.length, 63);
  assert.ok(paths[0]!.startsWith('M300 200 C'), paths[0]); // the first leaves the foot
  const fromFoot = paths.filter((d) => d.startsWith('M300 200 '));
  assert.equal(fromFoot.length, 7); // exactly the seven roots; everything else is a fork, leaving from a root
});

test('they do not reach for anything: nothing above the ground, nothing wider than a little past the reach, nothing deeper than the reach', () => {
  for (const seed of [1, 7, 42, 2024]) {
    for (const d of growRoots(foot, REACH, seed)) {
      for (const p of points(d)) {
        assert.ok(p.y >= foot.y - 0.1, `above the ground: ${d}`);
        assert.ok(Math.abs(p.x - foot.x) <= REACH * 1.35, `too wide (${p.x}): ${d}`);
        assert.ok(p.y - foot.y <= REACH * 1.0, `too deep (${p.y}): ${d}`);
      }
    }
  }
});

test('they grow with the tree: twice the reach is twice the roots, and none for a tree that has none', () => {
  const small = growRoots(foot, 50, 7).flatMap(points);
  const large = growRoots(foot, 100, 7).flatMap(points);
  const width = (ps: { x: number }[]) => Math.max(...ps.map((p) => Math.abs(p.x - foot.x)));
  assert.ok(width(large) > width(small) * 1.8 && width(large) < width(small) * 2.2);
  assert.deepEqual(growRoots(foot, 0), []);
  assert.deepEqual(growRoots(foot, -5), []);
  assert.deepEqual(growRoots(foot, Number.NaN), []);
});

test('a forked root is shorter than the one it comes from, and there are no bad numbers', () => {
  const paths = growRoots(foot, REACH);
  assert.ok(paths.every((d) => !/NaN|Infinity/.test(d)));
});
