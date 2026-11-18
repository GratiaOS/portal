// The box of drops, as the page sees it (RFC 002): what is left on the frequency a person holds. The page keeps none of it anywhere
// (no storage, no cache): it asks when the box is opened and when a pulse says something came, and lets go of it when the box is left.

import type { Drop } from './types.ts';

/** The hash that opens the box. A room's id starts with a letter or a digit, so no room can be called this. */
export const DROPS_HASH = '~drops';

export const wantsDrops = (hash: string | undefined): boolean => hash === DROPS_HASH;

/** What a packet that is about to go still shows: a trace, never nothing until it is gone. */
export const FLOOR = 0.12;

const MINUTE = 60_000;
const WEEK = 7 * 24 * 60 * MINUTE;

/**
 * How much of a packet is left, from 1 (a week or more) to the least that shows (a minute or less), and 0 the second its fade is reached.
 * Drawn on a scale of time and not of minutes, so that a day left still reads as a lot and the last hour is where it thins. It is a
 * rhythm to look at, not a date: the page says no hour and no number.
 */
export function fadeLevel(fadesAt: number, now: number): number {
  const left = fadesAt - now;
  if (left <= 0) return 0;
  if (left >= WEEK) return 1;
  if (left <= MINUTE) return FLOOR;
  return FLOOR + (1 - FLOOR) * (Math.log(left / MINUTE) / Math.log(WEEK / MINUTE));
}

/** What has not faded yet, in the order it came: the page does not wait to be told again once a fade is reached. */
export function stillThere(drops: Drop[], now: number): Drop[] {
  return drops.filter((drop) => drop.fadesAt > now);
}

/** The seal a packet is shown with when it came with none: the same one Amigo puts on a signal that has none. */
export const DEFAULT_SIGIL = '🐲';

export const sigilOf = (drop: Drop): string => drop.payload.sigil || DEFAULT_SIGIL;

/** What the words settle out of when the seal is broken: noise, as in Amigo's Room. */
export const TUNING_CHARS = '█▓▒░<>--=+~';

/** How long the words take to settle, in milliseconds. */
export const TUNING_MS = 900;

/**
 * The words as they settle: from the left, the first part of what is written is read as it is and the rest is still noise, so that at 0 it is
 * all noise and at 1 it is the words. Spaces and line breaks stay where they are, and an emoji is one thing, never cut in half. `random`
 * picks the noise, for tests.
 */
export function tuned(text: string, progress: number, random: () => number = Math.random): string {
  const chars = Array.from(text);
  const marks = chars.filter((char) => !/\s/.test(char)).length;
  const settled = Math.floor(Math.min(1, Math.max(0, progress)) * marks);
  let seen = 0;
  return chars
    .map((char) => {
      if (/\s/.test(char)) return char;
      seen += 1;
      return seen <= settled || progress >= 1 ? char : TUNING_CHARS[Math.floor(random() * TUNING_CHARS.length) % TUNING_CHARS.length]!;
    })
    .join('');
}
