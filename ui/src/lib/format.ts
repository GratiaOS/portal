import type { Participant, Turn } from './types.ts';

const pad = (n: number) => String(n).padStart(2, '0');

/** `13:05`, on the reader's clock. The only time the UI shows, and only on messages. */
export function clock(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Whether a title begins with a picture: then the picture is its mark, and the page does not put a `#` before it. */
export function startsWithPicture(title: string): boolean {
  return /^\p{Extended_Pictographic}/u.test(title.trim());
}

/** A hue from a name, so a person keeps their colour everywhere and in every session. */
export function hueOf(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

export type Row = { /** How visible the message is drawn, 0 to 1; absent when it does not fade. */ opacity?: number; turn: Turn; speaker: Participant | undefined; /** The people the message names, as the room worked them out. */ mentioned: Participant[]; /** The first of a run by the same person: it carries the name and the time. */ head: boolean };

/** Whether a message is for the reader: it names them, and they did not write it. */
export function addressedTo(row: Row, readerId: string | undefined): boolean {
  return readerId !== undefined && row.turn.speakerId !== readerId && row.mentioned.some((person) => person.id === readerId);
}

const RUN_MS = 3 * 60_000;

/** Turns as rows: a run of messages by the same person within a few minutes shows the name once. */
export function rowsOf(turns: Turn[], people: Participant[]): Row[] {
  const byId = new Map(people.map((p) => [p.id, p] as const));
  return turns.map((turn, i) => {
    const before = turns[i - 1];
    const head = !before || before.speakerId !== turn.speakerId || Date.parse(turn.createdAt) - Date.parse(before.createdAt) > RUN_MS;
    const mentioned = turn.mentions.flatMap((id) => byId.get(id) ?? []);
    return { turn, speaker: byId.get(turn.speakerId), mentioned, head };
  });
}

/** What Nova puts after an answer: a line that starts with the word for sources. Split off, so it can be shown as what it is. */
export function splitSources(text: string): { body: string; sources: string[] } {
  const match = /\n(?:Surse|Sources): (.+)$/.exec(text);
  if (!match) return { body: text, sources: [] };
  return { body: text.slice(0, match.index), sources: match[1]!.split(', ').filter(Boolean) };
}
