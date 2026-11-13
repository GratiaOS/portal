// 🍄 The roots under the tree on the gate: a counterweight to the breath, not a botany lesson. Thirteen shapes and no more, in three directions: a short thick
// pivot straight down, two strong roots to each side (one almost along the surface, one going down and out), and each of those four forking twice and
// stopping there. Each is a filled shape that tapers from thick at the trunk to a point, so that it reads as mass and not as a scratch of light, and its
// curve leaves its parent's own direction, so that nothing turns sharply. Drawn once from the foot and a reach (about the crown's half width), with a
// seed, so the same gate has the same roots on every load and every size. The page lights them with the breath; nothing here reads the page or the clock.

export type Point = { x: number; y: number };

/** A small, fixed generator (mulberry32): the same seed gives the same roots on every load and every size. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * How thick the roots start, and how fine they end, as a share of the reach: the pivot and the strong roots at the trunk, a branch where it leaves (a share of
 * its parent's width there, and never less than `least`, so that none is a scratch), and every tip.
 */
export const THICKNESS = { pivot: 0.11, strong: 0.085, down: 0.07, branch: 0.7, least: 0.032, tip: 0.016 } as const;

/** How many shapes there are: the pivot, four roots, and two branches on each of the four. */
export const ROOT_COUNT = 1 + 4 + 4 * 2;

const SAMPLES = 16;
const DOWN = Math.PI / 2;
const n = (value: number): string => (Math.round(value * 10) / 10).toString();
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

type Curve = [Point, Point, Point, Point];
const at = ([a, b, c, d]: Curve, t: number): Point => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};
const heading = (curve: Curve, t: number): number => {
  const a = at(curve, Math.max(0, t - 0.02));
  const b = at(curve, Math.min(1, t + 0.02));
  return Math.atan2(b.y - a.y, b.x - a.x);
};

/** A root's own curve: out from `from` along `going`, bending a little and never more than that, `length` long, never above `ground`. */
function curve(from: Point, going: number, length: number, bend: number, ground: number): Curve {
  const tip = (angle: number, share: number): Point => ({ x: from.x + Math.cos(angle) * length * share, y: Math.max(ground, from.y + Math.sin(angle) * length * share) });
  return [from, tip(going, 0.36), tip(going + bend * 0.6, 0.72), tip(going + bend, 1)];
}

/**
 * The outline of a root along its curve, thick at one end and fine at the other: a closed shape to be filled, with the point where it starts as its
 * first corner and the other side of the base as its last, so the width at the base is the distance between them. Nothing goes above `ground`.
 */
function shape(c: Curve, wide: number, fine: number, ground: number): string {
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const p = at(c, t);
    const a = heading(c, t);
    const half = lerp(wide, fine, t ** 0.8) / 2;
    left.push({ x: p.x - Math.sin(a) * half, y: Math.max(ground, p.y + Math.cos(a) * half) });
    right.push({ x: p.x + Math.sin(a) * half, y: Math.max(ground, p.y - Math.cos(a) * half) });
  }
  const out = [...left, ...right.reverse()];
  return `M${out.map((p) => `${n(p.x)} ${n(p.y)}`).join(' L')} Z`;
}

/**
 * Thirteen roots for a tree whose crown is about `reach` wide on each side of its foot: the pivot first, then, for each side, the root along the
 * surface and the one going down and out, each followed by its two branches. `d` strings for an SVG path, each a closed shape to fill. Nothing goes
 * above the foot, wider than a little past `reach`, or deeper than `reach`.
 */
export function growRoots(foot: Point, reach: number, seed = 7): string[] {
  if (!(reach > 0)) return [];
  const random = seeded(seed);
  const ground = foot.y;
  const out: string[] = [];
  const jitter = (spread: number) => (random() - 0.5) * spread;

  // the pivot: short, thick, and nearly straight down
  out.push(shape(curve(foot, DOWN + jitter(0.12), reach * (0.5 + random() * 0.08), jitter(0.2), ground), reach * THICKNESS.pivot, reach * THICKNESS.tip, ground));

  const mains: { side: 1 | -1; lie: number; length: number; wide: number }[] = [];
  for (const side of [1, -1] as const) {
    mains.push({ side, lie: 0.12 + random() * 0.08, length: 0.92 + random() * 0.08, wide: THICKNESS.strong });
    mains.push({ side, lie: 0.55 + random() * 0.12, length: 0.62 + random() * 0.08, wide: THICKNESS.down });
  }
  for (const { side, lie, length, wide } of mains) {
    // a root to the right leaves at `lie` below the surface; to the left, at the same angle mirrored
    const going = side === 1 ? lie : Math.PI - lie;
    // it leaves just under the surface, by half its own thickness, so that a root lying along it keeps its whole width and is not cut by the ground
    const base = reach * wide;
    const rootCurve = curve({ x: foot.x + side * reach * 0.03, y: foot.y + base * 0.5 }, going, reach * length, side * (0.12 + random() * 0.18) * (random() < 0.5 ? -1 : 1), ground);
    out.push(shape(rootCurve, base, reach * THICKNESS.tip, ground));

    // two branches, at two fifths and at seven tenths of the way: the first turns toward the vertical, the second toward the horizontal
    // (or, for a root that already lies along the surface, a little less toward the vertical again), and they stop there
    const nearHorizontal = lie < 0.3;
    [
      { t: 0.4, toward: 'vertical' as const, turn: 0.5 + random() * 0.15, share: 0.46 },
      { t: 0.7, toward: nearHorizontal ? ('vertical' as const) : ('horizontal' as const), turn: 0.3 + random() * 0.12, share: 0.38 },
    ].forEach(({ t, toward, turn, share }) => {
      const from = at(rootCurve, t);
      const parent = heading(rootCurve, t);
      const sx = Math.cos(parent) >= 0 ? 1 : -1;
      const h = toward === 'vertical' ? parent + sx * turn : parent - sx * turn;
      // a branch leaves in its parent's own direction and bends away from it, so that nothing turns sharply
      const branchCurve = curve(from, h, reach * length * share, sx * 0.1, ground);
      const here = lerp(base, reach * THICKNESS.tip, t ** 0.8);
      out.push(shape(branchCurve, Math.max(reach * THICKNESS.least, here * THICKNESS.branch), reach * THICKNESS.tip, ground));
    });
  }
  return out;
}
