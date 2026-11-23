// 🍄 The tree on the gate, drawn by one hand: the crown above the ground and the roots below it are the same kind of growing, one the mirror of the other
// (the way a tree is in the picture it was drawn from). A limb leaves the foot, forks, and each fork forks again, a little shorter and a little finer, until
// the twigs, and nothing grows outside the ellipse it is given, so the crown is a dome and the roots a wide shallow bowl. Each branch is a filled shape that
// tapers, joined to the end of the one it comes from, so nothing turns sharply. Drawn from a seed, so the same gate has the same tree on every load and every
// size. The page lights and moves it with the breath; nothing here reads the page or the clock.

export type Point = { x: number; y: number };

/** A small, fixed generator (mulberry32): the same seed gives the same tree on every load and every size. */
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
 * How thick a limb starts, as a share of the reach, how much of it is left where it forks (`taper`), and how fine the last twig is (`tip`, never
 * less than a hairline that can be seen).
 */
export const THICKNESS = { crown: 0.06, limb: 0.028, taper: 0.62, tip: 0.006 } as const;

/** How many times a limb forks: the crown stops a little sooner (its leaves do the rest), the roots go on to hairlines. */
export const FORKS = { crown: 4, roots: 5 } as const;

/** The limbs of the roots: angles from straight down, to the right (positive) and the left (negative), as the limbs of the crown are from straight up. */
const ROOT_LIMBS: { angle: number; length: number }[] = [
  { angle: 0, length: 0.5 },
  { angle: 0.28, length: 0.5 },
  { angle: -0.28, length: 0.5 },
  { angle: 0.62, length: 0.56 },
  { angle: -0.62, length: 0.56 },
  { angle: 0.98, length: 0.62 },
  { angle: -0.98, length: 0.62 },
  { angle: 1.25, length: 0.6 },
  { angle: -1.25, length: 0.6 },
  { angle: 1.42, length: 0.58 },
  { angle: -1.42, length: 0.58 },
];

const CROWN_LIMBS: { angle: number; length: number }[] = [
  { angle: -1.15, length: 0.34 },
  { angle: -0.62, length: 0.4 },
  { angle: -0.12, length: 0.44 },
  { angle: 0.32, length: 0.42 },
  { angle: 0.8, length: 0.38 },
  { angle: 1.25, length: 0.32 },
];

type Limb = { angle: number; length: number };
type Garden = {
  /** Where the limbs leave, and which way is away from the ground: -1 up the page (the crown), 1 down it (the roots). */
  foot: Point;
  away: 1 | -1;
  /** The ellipse nothing leaves: its half width, its half depth, and how far from the foot, along `away`, its centre is. */
  rx: number;
  ry: number;
  centre: number;
  limbs: Limb[];
  /** For the roots: the surface, which nothing of them comes above. */
  ground?: number;
  /** The size thickness is measured on, and the share of it a limb starts with. */
  reach: number;
  thick: number;
  forks: number;
  seed: number;
};

const n = (value: number): string => (Math.round(value * 10) / 10).toString();
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The outline of one branch, from `a` to `b` with a slight bow at its middle, as wide as `wa` at one end and `wb` at the other: a closed shape to fill. */
function branch(a: Point, b: Point, bow: number, wa: number, wb: number, ground?: number): string {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const m = { x: (a.x + b.x) / 2 + nx * bow, y: (a.y + b.y) / 2 + ny * bow };
  const wm = (wa + wb) / 2;
  const left = [
    { x: a.x + (nx * wa) / 2, y: a.y + (ny * wa) / 2 },
    { x: m.x + (nx * wm) / 2, y: m.y + (ny * wm) / 2 },
    { x: b.x + (nx * wb) / 2, y: b.y + (ny * wb) / 2 },
  ];
  const right = [
    { x: b.x - (nx * wb) / 2, y: b.y - (ny * wb) / 2 },
    { x: m.x - (nx * wm) / 2, y: m.y - (ny * wm) / 2 },
    { x: a.x - (nx * wa) / 2, y: a.y - (ny * wa) / 2 },
  ];
  // roots never come above the ground, even by the thickness of a limb that lies along it
  const low = (y: number) => (ground === undefined ? y : Math.max(ground, y));
  return `M${[...left, ...right].map((p) => `${n(p.x)} ${n(low(p.y))}`).join(' L')} Z`;
}

/** The branches of one growing, as shapes to fill, and the ends of its twigs. */
function grow(g: Garden): { shapes: string[]; tips: Point[] } {
  const random = seeded(g.seed);
  const shapes: string[] = [];
  const tips: Point[] = [];
  const cy = g.foot.y + g.away * g.centre;
  const inside = (p: Point): boolean => ((p.x - g.foot.x) / g.rx) ** 2 + ((p.y - cy) / g.ry) ** 2 <= 1;
  const towards = (from: Point, angle: number, length: number): Point => ({ x: from.x + Math.sin(angle) * length, y: from.y + g.away * Math.cos(angle) * length });
  const fine = Math.max(g.reach * THICKNESS.tip, 0.7);

  function limb(from: Point, angle: number, length: number, width: number, level: number): void {
    // a branch that would leave the ellipse is shortened until it does not, and if even a stub does, it is not grown
    let reachable = length;
    let end = towards(from, angle, reachable);
    for (let tries = 0; tries < 4 && !inside(end); tries += 1) {
      reachable *= 0.7;
      end = towards(from, angle, reachable);
    }
    if (!inside(end)) return;
    // never below the ground, whichever way it goes
    if ((end.y - g.foot.y) * g.away < 0) return;
    const narrow = Math.max(fine, width * THICKNESS.taper);
    shapes.push(branch(from, end, (random() - 0.5) * reachable * 0.22, width, narrow, g.ground));
    if (level >= g.forks) {
      tips.push(end);
      return;
    }
    const count = level === 0 || random() < 0.3 ? 3 : 2;
    for (let i = 0; i < count; i += 1) {
      const spread = 0.3 + random() * 0.4;
      const offset = count === 3 ? (i - 1) * (spread + 0.1) + (random() - 0.5) * 0.2 : (i === 0 ? -1 : 1) * spread;
      limb(end, angle + offset, reachable * (0.62 + random() * 0.18), narrow, level + 1);
    }
  }

  for (const { angle, length } of g.limbs) limb(g.foot, angle + (random() - 0.5) * 0.12, g.reach * length, g.reach * g.thick, 0);
  return { shapes, tips };
}

/**
 * The roots of a tree whose crown is about `reach` wide on each side of its foot: limbs that leave the foot to both sides and down, fork and fork again to
 * hairlines, in a bowl as wide as the crown and not half as deep. `d` strings for an SVG path, each a closed shape to fill. Nothing goes
 * above the foot, wider than a little past `reach`, or deeper than `reach`.
 */
export function growRoots(foot: Point, reach: number, seed = 7): string[] {
  if (!(reach > 0)) return [];
  // they leave just under the surface, so that a limb lying along it keeps its whole thickness
  const start = { x: foot.x, y: foot.y + reach * THICKNESS.limb * 0.5 };
  return grow({ ground: foot.y, foot: start, away: 1, rx: reach * 1.05, ry: reach * 0.4, centre: reach * 0.08, limbs: ROOT_LIMBS, reach, thick: THICKNESS.limb, forks: FORKS.roots, seed }).shapes;
}

/**
 * The crown, in the units of the picture it is drawn in: limbs leaving the top of the trunk, in a dome. `shapes` are the branches and `leaves` is one
 * outline of small round leaf masses at the ends of the twigs, with sky between them, so that the branches show through at its edge as they do in a real
 * tree against the light.
 */
export function growCrown(foot: Point, reach: number, height: number, seed = 11): { branches: string; leaves: string } {
  if (!(reach > 0) || !(height > 0)) return { branches: '', leaves: '' };
  const grown = grow({ foot, away: -1, rx: reach, ry: height * 0.56, centre: height * 0.5, limbs: CROWN_LIMBS, reach: height * 0.72, thick: THICKNESS.crown, forks: FORKS.crown, seed });
  const random = seeded(seed + 1);
  const puffs: string[] = [];
  for (const tip of grown.tips) {
    // two masses at each twig: one at its end, one a little back and to the side, of slightly different sizes
    for (const [share, side] of [[1, 0], [0.55, 1], [0.3, 1]] as const) {
      const r = reach * (0.032 + random() * 0.03) * lerp(1, 0.75, side);
      const cx = tip.x + side * (random() - 0.5) * r * 1.6;
      const cyy = tip.y + side * r * 0.9 * share;
      puffs.push(`M${n(cx - r)} ${n(cyy)}a${n(r)} ${n(r)} 0 1 0 ${n(2 * r)} 0a${n(r)} ${n(r)} 0 1 0 ${n(-2 * r)} 0Z`);
    }
  }
  return { branches: grown.shapes.join(' '), leaves: puffs.join(' ') };
}
