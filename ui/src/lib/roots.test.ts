import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FORKS, THICKNESS, growCrown, growRoots, seeded } from './roots.ts';

const foot = { x: 300, y: 200 };
const REACH = 100;

/** Every corner a shape names. */
const points = (d: string): { x: number; y: number }[] => {
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const out = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push({ x: nums[i]!, y: nums[i + 1]! });
  return out;
};
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

test('the same gate has the same tree: a seed gives the same numbers, another gives others', () => {
  const a = seeded(1);
  const b = seeded(1);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.notEqual(seeded(1)(), seeded(2)());
  assert.deepEqual(growRoots(foot, REACH, 7), growRoots(foot, REACH, 7));
  assert.notDeepEqual(growRoots(foot, REACH, 7), growRoots(foot, REACH, 8));
  assert.deepEqual(growCrown(foot, REACH, 100, 3), growCrown(foot, REACH, 100, 3));
});

test('the roots are many and fine, and not a crowd: they fork, and fork again, and stop', () => {
  for (const seed of [1, 7, 42, 2024]) {
    const count = growRoots(foot, REACH, seed).length;
    assert.ok(count >= 60 && count <= 600, `${count} shapes`);
  }
  assert.ok(FORKS.roots >= FORKS.crown, 'the roots go on to hairlines at least as far as the crown');
});

test('each is a closed shape to fill, and there are no bad numbers', () => {
  for (const d of growRoots(foot, REACH)) {
    assert.match(d, /^M[\d. -]+( L[\d. -]+)+ Z$/);
    assert.ok(!/NaN|Infinity/.test(d));
  }
  const crown = growCrown(foot, REACH, 100);
  assert.ok(crown.branches.length > 0 && crown.leaves.length > 0);
  assert.ok(!/NaN|Infinity/.test(crown.branches + crown.leaves));
});

test('they are thickest at the trunk and taper: the first limb starts as wide as it was meant to, and its tip is a fraction of that', () => {
  const [first] = growRoots(foot, REACH);
  const corners = points(first!);
  // the corners go along one side to the tip and back along the other: the first and the last are the two sides of the base
  const base = gap(corners[0]!, corners.at(-1)!);
  assert.ok(Math.abs(base - REACH * THICKNESS.limb) < 0.8, `base ${base}`);
  assert.ok(base <= REACH * 0.04, 'fine, as the lights of the doorway are');
  const half = corners.length / 2;
  assert.ok(gap(corners[half - 1]!, corners[half]!) < base * 0.8);
  for (const d of growRoots(foot, REACH)) {
    const c = points(d);
    assert.ok(gap(c[0]!, c.at(-1)!) >= 0.6, 'none is thinner than a hairline that can be seen');
  }
});

test('they do not reach for anything: nothing above the ground, nothing wider than a little past the reach, nothing deeper than the reach', () => {
  for (const seed of [1, 7, 42, 2024]) {
    for (const d of growRoots(foot, REACH, seed)) {
      for (const p of points(d)) {
        assert.ok(p.y >= foot.y - 0.1, `above the ground: ${d}`);
        assert.ok(Math.abs(p.x - foot.x) <= REACH * 1.15, `too wide (${p.x}): ${d}`);
        assert.ok(p.y - foot.y <= REACH * 1.0, `too deep (${p.y}): ${d}`);
      }
    }
  }
});

test('they spread to both sides and go down, as wide as the crown and shallower than it is wide', () => {
  const all = growRoots(foot, REACH).flatMap(points);
  const left = Math.min(...all.map((p) => p.x));
  const right = Math.max(...all.map((p) => p.x));
  const deep = Math.max(...all.map((p) => p.y)) - foot.y;
  assert.ok(foot.x - left > REACH * 0.7 && right - foot.x > REACH * 0.7, `${left}..${right}`);
  assert.ok(deep > REACH * 0.25 && deep < REACH * 0.5, `depth ${deep}: the doorway is under them, with room between`);
});

test('the crown is the mirror of it: it grows up from its foot, in a dome that does not pass its reach or its height', () => {
  const height = 100;
  const { branches, leaves } = growCrown(foot, REACH, height);
  const corners = branches.split(' Z').flatMap(points);
  assert.ok(corners.length > 0);
  for (const p of corners) {
    assert.ok(p.y <= foot.y + 0.1 + REACH * THICKNESS.crown, 'nothing under its foot');
    assert.ok(Math.abs(p.x - foot.x) <= REACH * 1.05, `too wide (${p.x})`);
    assert.ok(foot.y - p.y <= height * 1.3, `too tall (${p.y})`);
  }
  assert.ok(Math.min(...corners.map((p) => p.x)) < foot.x - REACH * 0.4 && Math.max(...corners.map((p) => p.x)) > foot.x + REACH * 0.4, 'it spreads to both sides');
});

test('they grow with the tree: twice the reach is twice the roots, and none for a tree that has none', () => {
  const small = growRoots(foot, 50, 7).flatMap(points);
  const large = growRoots(foot, 100, 7).flatMap(points);
  const width = (ps: { x: number }[]) => Math.max(...ps.map((p) => Math.abs(p.x - foot.x)));
  assert.ok(width(large) > width(small) * 1.7 && width(large) < width(small) * 2.3);
  assert.deepEqual(growRoots(foot, 0), []);
  assert.deepEqual(growRoots(foot, -5), []);
  assert.deepEqual(growRoots(foot, Number.NaN), []);
  assert.deepEqual(growCrown(foot, 0, 100), { branches: '', leaves: '' });
});
