// 🍄 The clock of the radio in Parking: a tape that plays round and round, counted from the epoch, so whoever presses the mushroom joins at the
// second everyone else is hearing. Nothing is asked of the band but the tape itself, and nothing is sent to anyone: the portal never says who
// listens. This file is only arithmetic and addresses; the element that plays is in `useRadio.ts`.

/** The band: one tape, public, answering any origin, gone after 24 hours (404 when there is none). The page's policy lets media come from here and nowhere else. */
export const BAND = 'https://amigo-fm.gratia.workers.dev';
export const TAPE_URL = `${BAND}/tape`;

/** How far a tape may be from the clock, in seconds, before it is put back on it when it comes round. */
export const DRIFT_MAX_S = 0.35;
/** The tighter tolerance for the first sound of a tape and for coming back to a page: playing starts a few tenths after the clock was read. */
export const START_DRIFT_S = 0.1;

const turn = (now: number, cycleMs: number): number => (((now % cycleMs) + cycleMs) % cycleMs) / cycleMs;

/** Where the tape is at `now` (ms since the epoch), in seconds from its top; 0 when its length is not known. */
export function tapePositionAt(now: number, durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return turn(now, durationSeconds * 1000) * durationSeconds;
}

/** How far a tape is from where the clock says it should be, in seconds, the shortest way round: positive when it is behind. */
export function driftFrom(now: number, position: number, durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  const half = durationSeconds / 2;
  let d = (tapePositionAt(now, durationSeconds) - position) % durationSeconds;
  if (d > half) d -= durationSeconds;
  if (d < -half) d += durationSeconds;
  return d;
}

/** Has a looping tape just come round? Its time went back by more than a jitter (a seek of a few tenths is not it). */
export function cameRound(previous: number, current: number): boolean {
  return current + 0.5 < previous;
}

/**
 * The guarded re-join: the second to put the tape at, or `null` when it is close enough to the clock to be left alone (a seek that was not
 * needed is a click in the sound).
 */
export function rejoinTarget(now: number, position: number, durationSeconds: number, tolerance = DRIFT_MAX_S): number | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  return Math.abs(driftFrom(now, position, durationSeconds)) > tolerance ? tapePositionAt(now, durationSeconds) : null;
}

/**
 * A new address on every load: a browser keeps the bytes of an address for as long as the page lives, so a tape that was left since would never be
 * heard. The band ignores what follows the "?".
 */
export function tapeAddress(now: number): string {
  return `${TAPE_URL}?${now.toString(36)}`;
}
