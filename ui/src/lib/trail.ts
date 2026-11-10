// The trail of a guest room, as the page keeps it. What a guest says does not last: the portal lets it go after `trailMinutes`, and
// before it goes the page lets it fade, like what a snail leaves behind it. The page does all of the drawing and the counting of age,
// from the time each turn carries; it keeps no copy of any turn anywhere (no storage, no cache): the turns live in the tab's memory
// and go with it, so a trail that has gone from the portal has not stayed on the visitor's machine.

/** The least that remains visible of a turn that is about to go: a trace, never nothing until it is gone. */
export const FLOOR = 0.18;

/** How many turns from the newest it takes for the tail to thin by distance alone. */
const REACH = 12;

/** How much of the fading is the age in time (the rest is the distance from the newest turn). */
const BY_TIME = 0.8;

/** Whether a turn is still inside the trail. */
export function inTrail(createdAt: string, trailMs: number, now: number): boolean {
  return now - Date.parse(createdAt) < trailMs;
}

/** How faded a turn is, 0 (as it was said) to 1 (about to go): mostly its age against the trail, and a little its distance from the newest. */
export function fadeOf(createdAt: string, trailMs: number, now: number, fromNewest: number): number {
  const byTime = Math.min(1, Math.max(0, (now - Date.parse(createdAt)) / trailMs));
  const byPlace = Math.min(1, Math.max(0, fromNewest / REACH));
  return BY_TIME * byTime + (1 - BY_TIME) * byPlace * byTime; // a place only thins what has begun to age: the newest never dims by place alone
}

/** The opacity a turn is drawn with. */
export function opacityOf(fade: number): number {
  return Math.round((1 - fade * (1 - FLOOR)) * 100) / 100;
}
