import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ROOT_COUNT, THICKNESS, growRoots, seeded } from './roots.ts';

const foot = { x: 300, y: 200 };
const REACH = 100;

/** Every corner a shape names: all stay inside what the roots may be. */
const points = (d: string): { x: number; y: number }[] => {
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const out = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i]!, y: nums[i + 1]! });
  return out;
};
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

test('the same gate has the same roots: a seed gives the same numbers, another gives others', () => {
  const a = seeded(1);
  const b = seeded(1);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.notEqual(seeded(1)(), seeded(2)());
  assert.deepEqual(growRoots(foot, REACH, 7), growRoots(foot, REACH, 7));
  assert.notDeepEqual(growRoots(foot, REACH, 7), growRoots(foot, REACH, 8));
});

test('thirteen shapes and no more, whatever the seed: the pivot, four roots, and two branches on each of them', () => {
  for (const seed of [1, 7, 42, 2024]) assert.equal(growRoots(foot, REACH, seed).length, ROOT_COUNT);
  assert.equal(ROOT_COUNT, 13);
  assert.ok(ROOT_COUNT <= 15);
});

test('each is a closed shape to fill, and there are no bad numbers', () => {
  for (const d of growRoots(foot, REACH)) {
    assert.match(d, /^M[\d. -]+( L[\d. -]+)+ Z$/);
    assert.ok(!/NaN|Infinity/.test(d));
  }
});

test('they are thick at the trunk: the pivot is as wide there as it was meant to be, and every root tapers to a fine tip', () => {
  const [pivot, ...rest] = growRoots(foot, REACH);
  const corners = points(pivot!);
  // the first corner and the last are the two sides of the base; the middle two are the two sides of the tip
  const base = gap(corners[0]!, corners.at(-1)!);
  near(base, REACH * THICKNESS.pivot, 0.8);
  const half = corners.length / 2;
  const tip = gap(corners[half - 1]!, corners[half]!);
  assert.ok(tip < base * 0.25, `tip ${tip} against base ${base}`);
  // and none of the roots starts as a scratch: at least three pixels at a reach of a hundred, even a branch
  for (const d of rest) {
    const c = points(d);
    assert.ok(gap(c[0]!, c.at(-1)!) >= REACH * THICKNESS.least * 0.9, d);
  }
});

function near(a: number, b: number, eps: number) {
  assert.ok(Math.abs(a - b) <= eps, `${a} is not within ${eps} of ${b}`);
}

test('they do not reach for anything: nothing above the ground, nothing wider than a little past the reach, nothing deeper than the reach', () => {
  for (const seed of [1, 7, 42, 2024]) {
    for (const d of growRoots(foot, REACH, seed)) {
      for (const p of points(d)) {
        assert.ok(p.y >= foot.y - 0.1, `above the ground: ${d}`);
        assert.ok(Math.abs(p.x - foot.x) <= REACH * 1.25, `too wide (${p.x}): ${d}`);
        assert.ok(p.y - foot.y <= REACH * 1.0, `too deep (${p.y}): ${d}`);
      }
    }
  }
});

test('the pivot goes down, short; the strong roots go out to both sides, one along the surface', () => {
  const [pivot, ...rest] = growRoots(foot, REACH);
  const p = points(pivot!);
  const depth = Math.max(...p.map((q) => q.y)) - foot.y;
  assert.ok(depth > REACH * 0.35 && depth <= REACH * 0.7, `depth ${depth}`);
  const widest = (d: string) => Math.max(...points(d).map((q) => Math.abs(q.x - foot.x)));
  const lefts = rest.filter((d) => points(d).some((q) => q.x < foot.x - 5));
  const rights = rest.filter((d) => points(d).some((q) => q.x > foot.x + 5));
  assert.ok(lefts.length >= 4 && rights.length >= 4);
  assert.ok(Math.max(...rest.map(widest)) > REACH * 0.8); // one of them lies out nearly to the reach
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
