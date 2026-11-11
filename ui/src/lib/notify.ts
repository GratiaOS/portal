import type { Turn } from './types.ts';

export type Notice = { title: string; body: string; tag: string };

/**
 * What others said after `after` that names the person, oldest first. Only a mention is news (decision 13): everything else
 * moves the number in the tab's title and nothing more. What the person said themself is not news to them.
 */
export function newsAfter(turns: Record<string, Turn[]>, after: number, meId: string | undefined): Turn[] {
  if (meId === undefined) return [];
  return Object.values(turns)
    .flat()
    .filter((turn) => turn.seq > after && turn.speakerId !== meId && turn.mentions.includes(meId))
    .sort((a, b) => a.seq - b.seq);
}

/** The highest turn the page holds, whoever said it. */
export function topSeq(turns: Record<string, Turn[]>): number {
  let top = 0;
  for (const list of Object.values(turns)) for (const turn of list) top = Math.max(top, turn.seq);
  return top;
}

/** `seen`: the last turn there was when the page was last looked at. `notified`: the last turn a notice has been shown for. */
export type Mark = { seen: number; notified: number };

/**
 * One step as turns arrive. While the page is looked at, nothing is news and the mark moves up. While it is not, the news
 * is every mention since it was last looked at, not only what came this time, so that a second mention in the same
 * channel makes the notice say two instead of replacing "one" with "one". News comes back only when something new has
 * arrived since the last notice. `waiting` is how many mentions have not been looked at, fresh or not: the badge's number.
 */
export function advance(
  mark: Mark,
  turns: Record<string, Turn[]>,
  meId: string | undefined,
  here: boolean,
): { mark: Mark; news: Turn[]; waiting: number } {
  const top = topSeq(turns);
  if (here) return { mark: { seen: Math.max(mark.seen, top), notified: Math.max(mark.notified, top) }, news: [], waiting: 0 };
  const waiting = newsAfter(turns, mark.seen, meId);
  const fresh = waiting.some((turn) => turn.seq > mark.notified);
  return { mark: { seen: mark.seen, notified: Math.max(mark.notified, top) }, news: fresh ? waiting : [], waiting: waiting.length };
}

/** The words of a notice, in the person's language: where, and never what. */
export type Say = { one: (channel: string) => string; many: (count: number, channel: string) => string };

/**
 * One notice per channel, and it says where and how many, never what: the words of a message do not go to the notification
 * layer of the system. The tag is the channel, so a newer notice takes the place of the older one instead of piling up.
 */
export function noticesFor(news: Turn[], channels: Record<string, string>, app: string, say: Say): Notice[] {
  const byChannel = new Map<string, number>();
  for (const turn of news) byChannel.set(turn.conversationId, (byChannel.get(turn.conversationId) ?? 0) + 1);
  return [...byChannel].map(([channel, count]) => {
    const title = channels[channel] ?? channel;
    return { title: app, body: count === 1 ? say.one(title) : say.many(count, title), tag: channel };
  });
}

/**
 * Whether a notice is shown at all: the person has them on for this session (a visitor's session never does: what a visitor reads stays on the
 * page, and not on the notifications of a computer that may hold a team's permission), there is news, and the browser allows it.
 */
export function mayNotify(enabled: boolean, news: number, permitted: boolean): boolean {
  return enabled && news > 0 && permitted;
}
