import type { Turn } from './types.ts';

/** The last turn of each channel that the person has been looking at the page for. */
export type Seen = Record<string, number>;

/**
 * Turns from other people that came after the last one seen, in every channel. `since` is where the room stood when the
 * page opened: what was said before it is history, not news, and a channel nobody has looked at yet starts from there.
 */
export function unreadIn(turns: Record<string, Turn[]>, seen: Seen, since: number, meId: string | undefined): number {
  let count = 0;
  for (const [channel, list] of Object.entries(turns)) {
    const after = seen[channel] ?? since;
    for (const turn of list) if (turn.seq > after && turn.speakerId !== meId) count += 1;
  }
  return count;
}

/** `seen` with this channel read up to its last turn; the same object when there is nothing new to read. */
export function readUpTo(seen: Seen, channel: string, last: number | undefined, since: number): Seen {
  if (last === undefined || last <= (seen[channel] ?? since)) return seen;
  return { ...seen, [channel]: last };
}

/** The room's sequence went back: it was started anew, and every mark we hold is of another life. */
export function rewound(before: number | undefined, after: number | undefined): boolean {
  return before !== undefined && after !== undefined && after < before;
}

/** The title of the tab: the name, and in front of it how many are waiting, when any are. */
export function titleWith(count: number, name: string): string {
  return count > 0 ? `(${count > 99 ? '99+' : count}) ${name}` : name;
}
