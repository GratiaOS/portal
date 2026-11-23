/**
 * Letting a guest in: a name of the hour, a binding to the guest room for a while, and a key, handed over once. Nothing here asks who the
 * visitor is, and nothing keeps where they came from: the door counts guests and callers, not people.
 */

import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { GuestsConfig } from './config.js';
import { pickLocale } from './locale.js';
import { tokenDigest } from './config.js';
import type { Conversation, Participant, Turn } from './domain.js';
import { RoomError } from './domain.js';
import type { RoomStore } from './store.js';

/** The names of the hour: small, calm animals. When they are all taken the next ones carry a number (`owl-2`). */
export const GUEST_NAMES: readonly string[] = ['owl', 'fox', 'heron', 'otter', 'hare', 'wren', 'lynx', 'finch', 'newt', 'swift', 'vole', 'crane', 'badger', 'robin', 'stoat', 'plover'];

/**
 * The name a person of the team goes by in the guest room, for the guests who read it: an animal and two digits (`owl-47`), worked out from who
 * they are and the day, so nothing is stored and nothing has to be remembered: the same person is the same animal all day, and another one tomorrow.
 */
export function pseudonymOf(speakerId: string, now: number): string {
  const h = createHash('sha256').update(`${speakerId}|${Math.floor(now / 86_400_000)}`).digest();
  return `${GUEST_NAMES[h[0] % GUEST_NAMES.length]}-${10 + (h.readUInt16BE(1) % 90)}`;
}

/** A turn as a guest is given it: anyone who is not a guest or a companion (the team, or someone the store no longer knows) speaks under a pseudonym, and names no one. */
export function forGuests(store: Pick<RoomStore, 'getParticipant'>, turn: Turn, now: number): Turn {
  const kind = store.getParticipant(turn.speakerId)?.kind;
  if (kind === 'guest' || kind === 'companion') return turn;
  return { ...turn, speakerId: `guest:${pseudonymOf(turn.speakerId, now)}`, mentions: [] };
}

/** The room is full: the portal hosts as many guests as it is told to. */
export class GuestRoomFull extends Error {
  constructor() {
    super('the guest room is full');
    this.name = 'GuestRoomFull';
  }
}

export type Admitted = {
  /** The guest's key. Shown once, never kept: only its digest is. */
  token: string;
  guest: Participant;
  room: Conversation;
  /** When the binding ends, in milliseconds since the epoch. */
  expiresAt: number;
};

function freeName(store: Pick<RoomStore, 'listParticipants'>): string {
  const taken = new Set(store.listParticipants().map((p) => p.alias.toLowerCase()));
  const start = randomInt(GUEST_NAMES.length);
  for (let round = 1; ; round += 1) {
    for (let i = 0; i < GUEST_NAMES.length; i += 1) {
      const base = GUEST_NAMES[(start + i) % GUEST_NAMES.length];
      const name = round === 1 ? base : `${base}-${round}`;
      if (!taken.has(name)) return name;
    }
  }
}

/** Lets one guest in, or says the room is full. The guest's language is the visitor's (`locale`), or English: it ends with them like their name. */
export function admitGuest(store: RoomStore, config: GuestsConfig, now: number, locale?: string): Admitted {
  const room = store.getConversation(config.room);
  if (!room || room.kind !== 'guest') throw new RoomError('not_found', `no guest room "${config.room}"`);
  if (store.countActiveGuests(now) >= config.maxActive) throw new GuestRoomFull();

  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + config.minutes * 60_000;
  // the questions a guest may ask the companion: none while she is off for guests, which is what keeps the door from ever asking her
  const budget = config.nova.enabled ? config.nova.questions : 0;
  const guest = store.createGuest({ alias: freeName(store), room: room.id, activeFrom: now, expiresAt, budget, keyDigest: tokenDigest(token), locale: pickLocale(locale) });
  return { token, guest, room, expiresAt };
}
