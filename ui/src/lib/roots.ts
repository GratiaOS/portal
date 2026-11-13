// 🍄 The roots under the tree on the gate, as they are in a real tree: they do not reach for anything. An olive spreads its roots about as wide as its
// crown, close under the surface, with a short taproot going down; each root forks, and the forks fork again, thinner and shorter. Drawn once from the
// foot and a reach (about the crown's half width), with a seed, so the same gate has the same roots on every load and every size. The page lights
// them with the breath; nothing here reads the page or the clock.

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

const n = (value: number): string => (Math.round(value * 10) / 10).toString();
const along = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};

/** How a root is named by its heading: in radians, with `y` down, so a quarter turn (PI / 2) is straight down. */
const DOWN = Math.PI / 2;

/**
 * One root: a curve from `from` along `heading`, bending a little, and then, while `depth` lasts, forks from it. A fork leaves at a third, a half and
 * four fifths of the way, turned to one side or the other, and is shorter and thinner (it is only a shorter path: thinness is the page's).
 * Nothing goes above `ground`.
 */
function root(from: Point, heading: number, length: number, depth: number, ground: number, random: () => number, out: string[]): void {
  const bend = (random() - 0.5) * 0.8;
  const tip = (angle: number, at: number): Point => ({ x: from.x + Math.cos(angle) * length * at, y: Math.max(ground, from.y + Math.sin(angle) * length * at) });
  const c1 = tip(heading, 0.35);
  const c2 = tip(heading + bend * 0.6, 0.72);
  const end = tip(heading + bend, 1);
  out.push(`M${n(from.x)} ${n(from.y)} C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(end.x)} ${n(end.y)}`);
  if (depth <= 0) return;

  const forks = depth > 1 ? [0.3, 0.55, 0.8] : [0.45, 0.8];
  for (const t of forks) {
    const here = along(from, c1, c2, end, t);
    const ahead = along(from, c1, c2, end, Math.min(1, t + 0.05));
    const going = Math.atan2(ahead.y - here.y, ahead.x - here.x);
    const turn = (random() < 0.5 ? -1 : 1) * (0.45 + random() * 0.55);
    root(here, going + turn, length * (0.34 + random() * 0.2), depth - 1, ground, random, out);
  }
}

/**
 * The roots of a tree whose crown is about `reach` wide on each side of its foot: a short taproot, two strong lateral roots nearly along the surface,
 * and four going down and out, each forking twice. `d` strings for an SVG path, each root followed by its forks. Nothing goes above the foot, or
 * wider than a little past `reach`, or deeper than about `0.8 * reach`.
 */
export function growRoots(foot: Point, reach: number, seed = 7): string[] {
  if (!(reach > 0)) return [];
  const random = seeded(seed);
  const out: string[] = [];
  const ground = foot.y;
  const jitter = (spread: number) => (random() - 0.5) * spread;
  // the strong roots near the surface, one to each side, going a little down
  root(foot, 0.16 + random() * 0.14, reach * (0.9 + random() * 0.15), 2, ground, random, out);
  root(foot, Math.PI - 0.16 - random() * 0.14, reach * (0.9 + random() * 0.15), 2, ground, random, out);
  // the ones that go down and out, two to each side
  for (const side of [1, -1]) {
    for (const lean of [0.62, 0.95]) {
      const heading = DOWN - side * (lean + jitter(0.2));
      root(foot, heading, reach * (0.55 + random() * 0.2), 2, ground, random, out);
    }
  }
  // the taproot, short and nearly straight
  root(foot, DOWN + jitter(0.3), reach * (0.5 + random() * 0.15), 1, ground, random, out);
  return out;
}
