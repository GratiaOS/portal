// The sign after a name, as the page offers it: a set of creatures and weather, the person's own signs before them, and the same
// test of "one emoji" as the portal makes (src/domain.ts, isSign).

/** Creatures and weather, four by three, as a character-select screen has them. No emoji of the protocol: those steer a talk. */
export const SIGNS: readonly string[] = ['🦁', '🦉', '🦊', '🐢', '🐝', '🍄', '🌱', '🌊', '🌙', '☀️', '🔥', '❄️'];

/** How many of a person's own signs are kept; the oldest goes when a new one comes. */
export const OWN_MAX = 8;

const KEY = 'portal.signs';
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** One grapheme, a pictograph, no letters or digits. */
export function isSign(value: string): boolean {
  if (!value || value.length > 32) return false;
  if ([...GRAPHEMES.segment(value)].length !== 1) return false;
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value) && !/[\p{L}\p{N}\s]/u.test(value);
}

type Memory = Pick<Storage, 'getItem' | 'setItem'>;

// storage can be missing, full or forbidden (a private window): the grid must work without it
const memory = (): Memory | undefined => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

/** The signs this person added themselves, newest first; they stay with their browser, like the look they chose. */
export function ownSigns(storage: Memory | undefined = memory()): string[] {
  try {
    const kept = JSON.parse(storage?.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(kept) ? kept.filter((s): s is string => typeof s === 'string' && isSign(s)).slice(0, OWN_MAX) : [];
  } catch {
    return [];
  }
}

/** How long a typed emoji is waited for before it is taken: a keyboard of emoji has no Enter, and a sequence (a flag, a family) arrives in more than one piece. */
export const TAKE_AFTER_MS = 450;

/** What was typed, as a sign if it is exactly one (spaces around it let go), and `undefined` when it is not one yet. */
export function signFrom(typed: string): string | undefined {
  const sign = typed.trim();
  return isSign(sign) ? sign : undefined;
}

/** Adds one to the front; one already there moves to the front; the oldest beyond OWN_MAX goes. */
export function addOwnSign(sign: string, storage: Memory | undefined = memory()): string[] {
  const next = [sign, ...ownSigns(storage).filter((s) => s !== sign)].slice(0, OWN_MAX);
  try {
    storage?.setItem(KEY, JSON.stringify(next));
  } catch {
    // kept for this visit only
  }
  return next;
}

/** What the grid shows: the person's own first, then the set, each once. */
export function tilesOf(own: readonly string[]): string[] {
  return [...new Set([...own, ...SIGNS])];
}

/** The next sign when stepping through them with ↑↓ (or ▲▼), round and round. */
export function stepSign(tiles: readonly string[], current: string | undefined, by: 1 | -1): string {
  const at = current === undefined ? -1 : tiles.indexOf(current);
  if (at < 0) return tiles[by === 1 ? 0 : tiles.length - 1]!;
  return tiles[(at + by + tiles.length) % tiles.length]!;
}
