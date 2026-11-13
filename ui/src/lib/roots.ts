// 🍄 The roots under the tree on the gate: a network that grows from its foot to the lights of the doorway, like a mycelium. Drawn once from
// the points it is given (the foot, and places along the string of bulbs), with a seed so that the same gate always has the same roots; the
// page lights them when the canopy lets go of its breath. Nothing here reads the page or the clock.

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
const at = (a: Point, b: Point, c: Point, d: Point, t: number): Point => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};

/**
 * One root to each target, and two small forks from each root: `d` strings for an SVG path, the root first and its forks after it. A root leaves the foot
 * going down, as roots do, and wanders a little on its way to its light; a fork leaves at a third or two thirds of the way, to one side.
 */
export function growRoots(foot: Point, targets: Point[], seed = 7): string[] {
  const random = seeded(seed);
  const paths: string[] = [];
  for (const target of targets) {
    const dx = target.x - foot.x;
    const dy = target.y - foot.y;
    const reach = Math.max(Math.hypot(dx, dy), 1);
    const c1 = { x: foot.x + dx * 0.08 + (random() - 0.5) * reach * 0.18, y: foot.y + Math.max(dy, reach * 0.3) * 0.55 };
    const c2 = { x: target.x - dx * 0.2 + (random() - 0.5) * reach * 0.2, y: target.y - Math.abs(dy) * 0.18 + (random() - 0.5) * 12 };
    paths.push(`M${n(foot.x)} ${n(foot.y)} C${n(c1.x)} ${n(c1.y)} ${n(c2.x)} ${n(c2.y)} ${n(target.x)} ${n(target.y)}`);

    for (const t of [0.35, 0.68]) {
      const from = at(foot, c1, c2, target, t);
      const ahead = at(foot, c1, c2, target, Math.min(1, t + 0.04));
      const heading = Math.atan2(ahead.y - from.y, ahead.x - from.x);
      const turn = (random() < 0.5 ? -1 : 1) * (0.5 + random() * 0.5);
      const length = reach * (0.14 + random() * 0.14);
      const end = { x: from.x + Math.cos(heading + turn) * length, y: from.y + Math.sin(heading + turn) * length };
      const bend = { x: from.x + Math.cos(heading + turn * 0.4) * length * 0.6, y: from.y + Math.sin(heading + turn * 0.4) * length * 0.6 };
      paths.push(`M${n(from.x)} ${n(from.y)} Q${n(bend.x)} ${n(bend.y)} ${n(end.x)} ${n(end.y)}`);
    }
  }
  return paths;
}
