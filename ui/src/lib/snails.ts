// The snails of a visit: each walks one trail's length, one after the other, and a person is on the one that is walking in their time. Where the
// snail is, is worked out from the clock and from the end of the key, which the portal told the page when the visitor came in; nothing is kept,
// there is no timer per snail, and no snail is tied to any message.

export type Snail = {
  /** Which one is walking, from 0. */
  index: number;
  /** How many there are in a visit: its length in trails, rounded up. */
  of: number;
  /** How far along its path, from 0 (the point of departure) to 1 (arrival). */
  progress: number;
};

/** How many snails a visit holds. */
export function snailsIn(visitMs: number, trailMs: number): number {
  return Math.max(1, Math.ceil(visitMs / trailMs));
}

/**
 * The snail walking at `now`, for a key that ends at `until` and lasts `visitMs`; none once it has ended. Before the start (a clock that is behind)
 * the first stands at its departure. The last one walks only what is left of the visit, so that it arrives when the key ends.
 */
export function snailAt(until: number, now: number, visitMs: number, trailMs: number): Snail | undefined {
  if (!(visitMs > 0) || !(trailMs > 0) || now >= until) return undefined;
  const elapsed = Math.max(0, now - (until - visitMs));
  const of = snailsIn(visitMs, trailMs);
  const index = Math.min(of - 1, Math.floor(elapsed / trailMs));
  const span = Math.min(trailMs, visitMs - index * trailMs);
  const progress = Math.min(1, Math.max(0, (elapsed - index * trailMs) / span));
  return { index, of, progress };
}
