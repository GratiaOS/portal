import { hueOf } from './format.ts';
import type { Activity, Participant, Presence } from './types.ts';

export type Person = { participant: Participant; here: boolean };

/**
 * The people of the room as the page lists them: humans first, then companions, each in alphabetical order, and always
 * in that order. The list does not move when someone comes or goes; only their dot changes.
 */
export function peopleOf(participants: Participant[], presence: Record<string, Presence>): Person[] {
  const rank = (p: Participant) => (p.kind === 'human' ? 0 : 1);
  return [...participants]
    .sort((a, b) => rank(a) - rank(b) || a.alias.localeCompare(b.alias, 'ro', { sensitivity: 'base' }))
    .map((participant) => ({
      participant,
      // a companion is there while the room runs, unless the room says otherwise; a person or a visitor is not, until they are
      here: (presence[participant.id]?.state ?? (participant.kind === 'human' || participant.kind === 'guest' ? 'offline' : 'online')) === 'online',
    }));
}

/** The names of those working on an answer in this channel. */
export function thinkingIn(channelId: string | undefined, thinking: Activity[], participants: Participant[]): string[] {
  if (!channelId) return [];
  const names = new Map(participants.map((p) => [p.id, p.alias] as const));
  return thinking.filter((a) => a.conversationId === channelId && a.state === 'thinking').map((a) => names.get(a.participantId) ?? a.participantId.split(':')[1] ?? a.participantId);
}

/**
 * Where someone sits on a scope, for a skin that draws one: an angle (0 to 359) and a ring (1, 2 or 3, from the middle out).
 * Worked out from the id and nothing else, so it is the same for everyone, on every visit, and it means nothing: it is
 * not nearness, not recency. Presence is told by a dot and never by when, and a place on a radar must not tell it either.
 */
export function bearingOf(id: string): { angle: number; ring: 1 | 2 | 3 } {
  return { angle: hueOf(`${id}/bearing`), ring: ((hueOf(`${id}/ring`) % 3) + 1) as 1 | 2 | 3 };
}
