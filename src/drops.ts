/**
 * What a drop is, after RFC 002: a short packet left on a frequency by anyone, read by the one who holds the frequency, and gone at its fade.
 * It has no sender and no author: nothing here says who left it. It is not a turn (a turn has a speaker, and its `seq` is the order of what
 * is said and the cursor of the stream), so it lives apart from the conversations and is not kept by what a portal keeps of what was said.
 */

import { isSign } from './domain.js';

/** A frequency: one to three digits, a dot and one digit (`99.6`, `36.9`). The address a drop is left at. */
export const FREQ_PATTERN = /^\d{1,3}\.\d$/;

/** What a packet's payload is, unless it says: text or markdown. Others are kept a place (`payload.format`), and unknown ones are shown as text. */
export const DEFAULT_FORMAT = 'note';

export const MAX_FORMAT_LENGTH = 40;

/** The most a sigil may be, in bytes of UTF-8: room for a flag or a person with a skin tone and a thing in their hand, and not for a joined crowd. */
export const MAX_SIGIL_BYTES = 16;

/** The seal a packet was sealed with, in Amigo: one emoji (a flag, a skin tone or a joined pair is one), and small. */
export function isSigil(value: unknown): value is string {
  return isSign(value) && new TextEncoder().encode(value).byteLength <= MAX_SIGIL_BYTES;
}

/** One drop, as it is read back: the packet and when it was left and when it goes. Times are milliseconds since the epoch. */
export type Drop = {
  id: number;
  freq: string;
  format: string;
  body: string;
  /** The seal it was sealed with, when it came with one; absent otherwise (the page shows its own). */
  sigil?: string;
  createdAt: number;
  fadesAt: number;
};

const FADE_PATTERN = /^([1-9]\d*)([mhd])$/;
const FADE_UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 } as const;

/** `45m`, `24h`, `7d`: a whole number of minutes, hours or days, in milliseconds; `undefined` for anything else. */
export function parseFade(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const found = FADE_PATTERN.exec(value);
  if (!found) return undefined;
  const ms = Number(found[1]) * FADE_UNIT_MS[found[2] as keyof typeof FADE_UNIT_MS];
  return Number.isSafeInteger(ms) ? ms : undefined;
}

/**
 * When the next alarm goes (milliseconds), for a home whose alarm is one: the nearest of the pace it lets go of other things at (`periodicMs`
 * from now, when it has one) and the time the nearest drop fades (`nextFade`, when there is one). `null` when there is nothing to wake for.
 */
export function nextAlarm(input: { now: number; periodicMs?: number; nextFade: number | null }): number | null {
  const times = [input.periodicMs === undefined ? undefined : input.now + input.periodicMs, input.nextFade ?? undefined].filter((t): t is number => t !== undefined);
  return times.length ? Math.min(...times) : null;
}
