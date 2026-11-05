/** A minute with no hand on the page: after it, the lines of the column turn to rest. */
export const IDLE_MS = 60_000;

/**
 * Whether nothing has been done since `last` (a clock reading, in ms) by `now`. The page only asks this of itself, to choose a line: nothing of it
 * is sent, kept or shown to anyone else.
 */
export function isIdle(last: number, now: number, after = IDLE_MS): boolean {
  return now - last >= after;
}
