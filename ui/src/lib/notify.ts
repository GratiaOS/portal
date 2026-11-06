import type { Turn } from './types.ts';

export type Notice = { title: string; body: string; tag: string };

/** What others said after `after`, oldest first. What the person said themself is not news to them. */
export function newsAfter(turns: Record<string, Turn[]>, after: number, meId: string | undefined): Turn[] {
  return Object.values(turns)
    .flat()
    .filter((turn) => turn.seq > after && turn.speakerId !== meId)
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
 * is everything others said since it was last looked at, not only what came this time, so that a second message in the
 * same channel makes the notice say two instead of replacing "one" with "one". News comes back only when something new
 * has arrived since the last notice.
 */
export function advance(mark: Mark, turns: Record<string, Turn[]>, meId: string | undefined, here: boolean): { mark: Mark; news: Turn[] } {
  const top = topSeq(turns);
  if (here) return { mark: { seen: Math.max(mark.seen, top), notified: Math.max(mark.notified, top) }, news: [] };
  const news = newsAfter(turns, mark.seen, meId);
  const fresh = news.some((turn) => turn.seq > mark.notified);
  return { mark: { seen: mark.seen, notified: Math.max(mark.notified, top) }, news: fresh ? news : [] };
}

const BODY_MAX = 140;
const clip = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > BODY_MAX ? `${flat.slice(0, BODY_MAX - 1).trimEnd()}…` : flat;
};

/**
 * One notice per channel: the person and the words when one turn came, the channel and how many when several did. The
 * tag is the channel, so a newer notice takes the place of the older one instead of piling up.
 */
export function noticesFor(
  news: Turn[],
  names: Record<string, string>,
  channels: Record<string, string>,
  many: (count: number) => string,
): Notice[] {
  const byChannel = new Map<string, Turn[]>();
  for (const turn of news) byChannel.set(turn.conversationId, [...(byChannel.get(turn.conversationId) ?? []), turn]);
  return [...byChannel].map(([channel, turns]) => {
    const last = turns[turns.length - 1]!;
    const who = names[last.speakerId] ?? last.speakerId.split(':')[1] ?? last.speakerId;
    return turns.length === 1
      ? { title: who, body: clip(last.text), tag: channel }
      : { title: channels[channel] ?? channel, body: `${many(turns.length)} · ${who}: ${clip(last.text)}`, tag: channel };
  });
}

/**
 * Whether a notice is shown at all: the person has them on for this session (a visitor's session never does: what a visitor reads stays on the
 * page, and not on the notifications of a computer that may hold a team's permission), there is news, and the browser allows it.
 */
export function mayNotify(enabled: boolean, news: number, permitted: boolean): boolean {
  return enabled && news > 0 && permitted;
}
