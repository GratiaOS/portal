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

test('an exhale from the top goes down, and reaches the bottom a half cycle later', () => {
  const c = new Circle();
  c.hear('a', 10, 'inhale', 0);
  for (let t = 500; t <= CYCLE / 2; t += 500) kept(c, 'a', 10, 'inhale', t);
  near(c.value(CYCLE / 2), 1);
  c.hear('a', 10, 'exhale', CYCLE / 2); // turns at the top
  kept(c, 'a', 10, 'exhale', CYCLE / 2 + CYCLE / 4);
  near(c.value(CYCLE / 2 + CYCLE / 4), 0);
  kept(c, 'a', 10, 'exhale', CYCLE);
  near(c.value(CYCLE), -1);
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

test('the light is one movement on the canopy\'s own curve: dark when it is closed, whole when it is open, in step the whole way', () => {
  const c = new Circle();
  const NEUTRAL = 60_000 / NEUTRAL_BPM;
  near(c.light(0), 0); // the neutral begins closed
  near(c.light(0.5 * NEUTRAL), 1); // and is open at the half
  let last = c.light(0);
  for (let t = 0; t <= 0.5 * NEUTRAL; t += NEUTRAL / 40) {
    near(c.light(t), (1 + c.value(t)) / 2); // exactly the canopy's curve, never a curve of its own
    assert.ok(c.light(t) >= last - 1e-9); // lit more and more for as long as it opens
    last = c.light(t);
  }
  for (let t = 0.5 * NEUTRAL; t <= NEUTRAL; t += NEUTRAL / 40) {
    assert.ok(c.light(t) <= last + 1e-9); // and less and less as it closes: the light goes down, into the roots
    last = c.light(t);
  }
  // what the sky has, the roots lack: they are `1 - light`, so together they are one whole
  for (const t of [0, 1_000, 3_000, 5_000]) near(c.light(t) + (1 - c.light(t)), 1);
});

test('a hold keeps the light where it is, at the top: the sky stays lit and the roots stay dark', () => {
  const c = new Circle();
  c.hear('me', 10, 'inhale', 0);
  for (let t = 500; t <= 3_000; t += 500) c.hear('me', 10, 'inhale', t);
  c.hear('me', 10, 'hold', 3_000);
  for (const t of [4_000, 6_000, 8_000]) {
    c.hear('me', 10, 'hold', t);
    near(c.light(t), 1);
  }
});

test('with many, the light never leaves what a glow can be', () => {
  const many = new Circle();
  for (const id of ['a', 'b', 'c']) many.hear(id, 12, 'inhale', 0);
  for (let t = 0; t < 5_000; t += 250) for (const id of ['a', 'b', 'c']) {
    many.hear(id, 12, 'inhale', t);
    const lit = many.light(t);
    assert.ok(lit >= 0 && lit <= 1);
  }
});

test('a touch never makes the canopy jump: a new breath, a turn, a hold and a rate all go on from where the canopy is', () => {
  const c = new Circle();
  const at = 10_000;
  const before = c.value(at); // the tree's own breath, mid-way somewhere
  c.hear('me', 8, 'inhale', at); // sitting down
  near(c.value(at), before);
  assert.ok(Math.abs(c.value(at + 16) - before) < 0.02); // and a frame later, only a little further along

  // turning from inhale to exhale (a release) is a turn, not a step
  const t1 = at + 2_000;
  c.hear('me', 8, 'inhale', t1);
  const turning = c.value(t1);
  c.hear('me', 8, 'exhale', t1);
  near(c.value(t1), turning);
  // and a change of rate too
  const t2 = t1 + 1_500;
  c.hear('me', 8, 'exhale', t2);
  const same = c.value(t2);
  c.hear('me', 14, 'exhale', t2);
  near(c.value(t2), same);
});

test('an inhale goes on rising from the present value, and an exhale goes on falling', () => {
  const c = new Circle();
  c.hear('me', 10, 'inhale', 0);
  c.hear('me', 10, 'inhale', 1_500);
  const mid = c.value(1_500); // 0: half way up
  near(mid, 0);
  c.hear('me', 10, 'exhale', 1_500); // turns at the middle: goes down from there
  c.hear('me', 10, 'exhale', 2_500);
  assert.ok(c.value(2_500) < mid);
  c.hear('me', 10, 'inhale', 2_500); // and turns again
  c.hear('me', 10, 'inhale', 3_500);
  assert.ok(c.value(3_500) > c.value(2_500));
});

test('a hold stays where the breath is, however long', () => {
  const c = new Circle();
  c.hear('me', 10, 'inhale', 0);
  c.hear('me', 10, 'inhale', 2_000);
  const high = c.value(2_000);
  c.hear('me', 10, 'hold', 2_000);
  for (const t of [3_000, 4_000, 5_000]) {
    c.hear('me', 10, 'hold', t);
    near(c.value(t), high);
  }
});

test('a source that is new comes in over a second, so the canopy does not jump to meet it', () => {
  const c = new Circle();
  c.hear('a', 10, 'inhale', 0);
  for (let t = 0; t <= 5_000; t += 500) c.hear('a', 10, 'inhale', t);
  const before = c.value(5_000);
  c.hear('b', 17, 'exhale', 5_000);
  near(c.value(5_000), before); // not there yet
  const half = new Circle();
  half.hear('a', 10, 'inhale', 0);
  for (let t = 0; t <= 5_000; t += 500) half.hear('a', 10, 'inhale', t);
  half.hear('b', 17, 'exhale', 5_000);
  const later = (() => {
    half.hear('a', 10, 'inhale', 5_500);
    half.hear('b', 17, 'exhale', 5_500);
    return half.value(5_500);
  })();
  assert.ok(Number.isFinite(later));
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

test('held, it is an inhale until the top and a hold there for as long as it is held; let go, an exhale at the rate it was given, and on by itself', () => {
  const b = new Breather();
  b.sit(0);
  b.press(500);
  assert.equal(b.phase(500), 'inhale');
  assert.equal(b.phase(500 + 30_000 / NEUTRAL_BPM - 1), 'inhale'); // rising for as long as a breath takes to rise
  assert.equal(b.phase(500 + 30_000 / NEUTRAL_BPM), 'hold'); // then at rest at the top
  assert.equal(b.phase(60_000), 'hold'); // however long
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
