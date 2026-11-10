// How long a visit has left, counted on the visitor's own clock from the moment it ends (which the portal said when they came in).

/** Whole minutes left, rounded up (a visit with ten seconds left has one minute), and 0 once it is over; `undefined` when it is not known. */
export function minutesLeft(until: number | undefined, now: number): number | undefined {
  if (until === undefined) return undefined;
  return Math.max(0, Math.ceil((until - now) / 60_000));
}

/** From how many minutes left the top bar says so; before that the visit is not counted aloud. */
export const SAY_FROM = 10;
