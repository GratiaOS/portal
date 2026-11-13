import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Breather, Circle, GONE_MS, KEEP_MS, NEUTRAL_BPM, Rhythm, ceiling, hasTree, weight } from './breath.ts';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);
const CYCLE = 60_000 / 10; // at 10 breaths a minute

test('a source is whole while fresh, then fades to nothing by ten seconds', () => {
  assert.equal(weight(0), 1);
  assert.equal(weight(KEEP_MS), 1);
  assert.ok(weight(6_000) > 0 && weight(6_000) < 1);
  assert.equal(weight(GONE_MS), 0);
  assert.equal(weight(60_000), 0);
});

/** What the portal does while someone sits: the same breath again every two seconds, so the source stays whole. */
const kept = (c: Circle, id: string, rate: number, phase: 'inhale' | 'exhale', now: number): void => c.hear(id, rate, phase, now);

test('alone, one breath is a wave at its own rate: an inhale begins at the bottom and rises', () => {
  const c = new Circle();
  c.hear('a', 10, 'inhale', 0);
  near(c.value(0), -1);
  kept(c, 'a', 10, 'inhale', CYCLE / 4);
  near(c.value(CYCLE / 4), 0);
  kept(c, 'a', 10, 'inhale', CYCLE / 2);
  near(c.value(CYCLE / 2), 1);
  kept(c, 'a', 10, 'inhale', CYCLE);
  near(c.value(CYCLE), -1);
});

test('an exhale begins at the top', () => {
  const c = new Circle();
  c.hear('a', 10, 'exhale', 0);
  near(c.value(0), 1);
  kept(c, 'a', 10, 'exhale', CYCLE / 2);
  near(c.value(CYCLE / 2), -1);
});

test('the signal that comes again with the same phase does not make the canopy jump', () => {
  const c = new Circle();
  c.hear('a', 10, 'inhale', 0);
  const before = c.value(2_000);
  c.hear('a', 10, 'inhale', 2_000);
  near(c.value(2_000), before);
  near(c.value(2_500), (() => { const d = new Circle(); d.hear('a', 10, 'inhale', 0); return d.value(2_500); })());
});

test('two breaths are two oscillators added, not an average', () => {
  const together = new Circle();
  together.hear('a', 10, 'inhale', 0);
  together.hear('b', 10, 'inhale', 0);
  kept(together, 'a', 10, 'inhale', CYCLE / 2);
  kept(together, 'b', 10, 'inhale', CYCLE / 2);
  near(together.value(CYCLE / 2), ceiling(2)); // both at the crest: more than one alone, and more than the average

  const apart = new Circle();
  apart.hear('a', 10, 'inhale', 0); // rising
  apart.hear('b', 10, 'exhale', 0); // falling: they cancel
  near(apart.value(0), 0);
  kept(apart, 'a', 10, 'inhale', CYCLE / 4);
  kept(apart, 'b', 10, 'exhale', CYCLE / 4);
  near(apart.value(CYCLE / 4), 0);

  // different rates are never in step for long: the irregularity is the point
  const at = (t: number) => {
    const odd = new Circle();
    odd.hear('a', 10, 'inhale', 0);
    odd.hear('b', 17, 'inhale', 0);
    odd.hear('a', 10, 'inhale', t);
    odd.hear('b', 17, 'inhale', t);
    return odd.value(t);
  };
  assert.notEqual(at(2_000).toFixed(3), at(2_000 + CYCLE).toFixed(3));
});

test('the ceiling lets a sum grow past one, slowly, and never past a third more', () => {
  assert.equal(ceiling(0.4), 0.4);
  assert.equal(ceiling(-1), -1);
  assert.ok(ceiling(2) > 1 && ceiling(2) < 1.35);
  assert.ok(ceiling(50) <= 1.35 + 1e-9);
  assert.ok(ceiling(-50) >= -1.35 - 1e-9);
});

test('with no one, the tree breathes its own breath at eight a minute', () => {
  const c = new Circle();
  const NEUTRAL = 60_000 / NEUTRAL_BPM;
  near(c.value(0), -1);
  near(c.value(NEUTRAL / 2), 1);
  near(c.value(NEUTRAL), -1);
});

test('when the last one goes silent, the canopy gives itself back to the neutral over ten seconds, and the source is let go', () => {
  const c = new Circle();
  c.hear('a', 30, 'inhale', 0); // a fast breath, to tell it apart from the neutral
  const neutral = (t: number) => Math.sin(2 * Math.PI * (NEUTRAL_BPM / 60_000) * t - Math.PI / 2);
  const own = (t: number) => Math.sin(2 * Math.PI * (30 / 60_000) * t - Math.PI / 2);
  // while it is fresh, the tree is that breath alone
  near(c.value(KEEP_MS), own(KEEP_MS));
  // then it fades, and what it leaves empty is the tree's own: a blend that gives itself back a little at a time
  const mid = (KEEP_MS + GONE_MS) / 2;
  const w = weight(mid);
  assert.ok(w > 0 && w < 1);
  near(c.value(mid), w * own(mid) + (1 - w) * neutral(mid));
  // after ten seconds only the neutral is left, exactly what an empty tree gives
  near(c.value(GONE_MS + 1), new Circle().value(GONE_MS + 1));
});

test('the roots are lit by the exhale: when the canopy falls, not when it rises or rests', () => {
  const c = new Circle();
  const NEUTRAL = 60_000 / NEUTRAL_BPM;
  assert.ok(c.release(0.25 * NEUTRAL) < 0.02); // opening
  assert.ok(c.release(0.5 * NEUTRAL) < 0.1); // at the crest, about to fall
  near(c.release(0.75 * NEUTRAL), 1, 0.02); // falling fastest
  assert.ok(c.release(1.0 * NEUTRAL) < 0.1); // at the bottom
  // and with a faster breath it is never more than whole
  const fast = new Circle();
  fast.hear('a', 30, 'exhale', 0);
  for (let t = 0; t < 2_000; t += 50) {
    fast.hear('a', 30, 'exhale', t);
    const lit = fast.release(t + 50);
    assert.ok(lit >= 0 && lit <= 1);
  }
});

test('whoever stands up is let go at once', () => {
  const c = new Circle();
  c.hear('me', 30, 'inhale', 0);
  c.let('me');
  near(c.value(1_000), new Circle().value(1_000));
});

test('a rate outside what the portal accepts is kept inside it', () => {
  const c = new Circle();
  c.hear('a', 0.1, 'inhale', 0);
  c.hear('b', 900, 'inhale', 0);
  assert.ok(Number.isFinite(c.value(1_000)));
});

test('sitting begins an inhale at the neutral rate, and goes on by itself: half a cycle in, half out', () => {
  const b = new Breather();
  b.sit(1_000);
  const half = 30_000 / NEUTRAL_BPM;
  assert.equal(b.phase(1_000), 'inhale');
  assert.equal(b.phase(1_000 + half - 1), 'inhale');
  assert.equal(b.phase(1_000 + half), 'exhale');
  assert.equal(b.phase(1_000 + 2 * half), 'inhale');
});

test('held, it is an inhale for as long as it is held; let go, an exhale at the rate it was given, and on by itself', () => {
  const b = new Breather();
  b.sit(0);
  b.press(500);
  assert.equal(b.phase(500), 'inhale');
  assert.equal(b.phase(60_000), 'inhale'); // however long
  b.release(4_000, 12);
  assert.equal(b.rate, 12);
  const half = 30_000 / 12;
  assert.equal(b.phase(4_000), 'exhale');
  assert.equal(b.phase(4_000 + half), 'inhale');
});

test('a rate given outside the range is kept inside it', () => {
  const b = new Breather();
  b.release(0, 500);
  assert.equal(b.rate, 30);
  b.release(0, 0);
  assert.equal(b.rate, 1);
});

test('the rhythm of holds: no rate before a second press; then the time between presses is one breath', () => {
  const r = new Rhythm();
  assert.equal(r.rate(), NEUTRAL_BPM);
  r.press(0);
  assert.equal(r.rate(), NEUTRAL_BPM);
  r.press(6_000); // a breath of six seconds: ten a minute
  assert.equal(r.rate(), 10);
});

test('the rhythm follows the person, half and half, and starts over after a minute', () => {
  const r = new Rhythm();
  r.press(0);
  r.press(6_000); // 6 s
  r.press(16_000); // 10 s: (6 + 10) / 2 = 8 s
  assert.equal(r.rate(), 7.5);
  r.press(16_000 + 61_000); // a pause: begins again
  assert.equal(r.rate(), NEUTRAL_BPM);
});

test('the rhythm stays inside what the portal accepts', () => {
  const quick = new Rhythm();
  quick.press(0);
  quick.press(100);
  assert.equal(quick.rate(), 30);
  const slow = new Rhythm();
  slow.press(0);
  slow.press(59_000);
  assert.equal(slow.rate(), 1);
});

test('the gate learns there is a tree from the health, and from nothing else', async () => {
  const says = (body: unknown, ok = true) => (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;
  assert.equal(await hasTree(says({ ok: true, breath: true })), true);
  assert.equal(await hasTree(says({ ok: true })), false);
  assert.equal(await hasTree(says({ breath: 'yes' })), false);
  assert.equal(await hasTree(says({ breath: true }, false)), false);
  assert.equal(await hasTree((async () => { throw new Error('away'); }) as unknown as typeof fetch), false);
});
