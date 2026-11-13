// 🌬️ The breath of the tree on the gate: one number, from the clock. Nothing is sent, nothing is kept and no one has to do anything: the breath is a function of
// the time of day, at a fixed eight a minute, counted from the same instant for everyone (the epoch), so that two people who open the gate at the same time see the
// same pulse, with no connection between them and not a byte on the network. Whoever looks is breathing with it.

/** Breaths a minute: the tree's own, slow enough to settle the one who watches. */
export const BREATHS_PER_MINUTE = 8;
/** How long one breath is, in ms: 7 500, which divides the day, so the pulse is the same on every clock that is right. */
export const CYCLE_MS = 60_000 / BREATHS_PER_MINUTE;

/**
 * How open the tree is at `now` (ms since the epoch, as `Date.now()` says): -1 closed, 1 open, a smooth wave between them that is closed at the instant the
 * epoch began and open half a breath later. The same at the same time on every device; a device that was asleep and wakes is in step at once.
 */
export function breathAt(now: number): number {
  const phase = (((now % CYCLE_MS) + CYCLE_MS) % CYCLE_MS) / CYCLE_MS;
  return -Math.cos(2 * Math.PI * phase);
}
