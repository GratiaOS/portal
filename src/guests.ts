/**
 * Letting a guest in: a name of the hour, a binding to the guest room for a while, and a key, handed over once. Nothing here asks who the
 * visitor is, and nothing keeps where they came from: the door counts guests and callers, not people.
 */

import { randomBytes, randomInt } from 'node:crypto';
import type { GuestsConfig } from './config.js';
import { tokenDigest } from './config.js';
import type { Conversation, Participant } from './domain.js';
import { RoomError } from './domain.js';
import type { RoomStore } from './store.js';

/** The names of the hour: small, calm animals. When they are all taken the next ones carry a number (`owl-2`). */
export const GUEST_NAMES: readonly string[] = ['owl', 'fox', 'heron', 'otter', 'hare', 'wren', 'lynx', 'finch', 'newt', 'swift', 'vole', 'crane', 'badger', 'robin', 'stoat', 'plover'];

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

/** Lets one guest in, or says the room is full. */
export function admitGuest(store: RoomStore, config: GuestsConfig, now: number): Admitted {
  const room = store.getConversation(config.room);
  if (!room || room.kind !== 'guest') throw new RoomError('not_found', `no guest room "${config.room}"`);
  if (store.countActiveGuests(now) >= config.maxActive) throw new GuestRoomFull();

  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + config.minutes * 60_000;
  // no question to the companion yet: a guest's budget of them is zero until the companion is opened to guests
  const guest = store.createGuest({ alias: freeName(store), room: room.id, activeFrom: now, expiresAt, budget: 0, keyDigest: tokenDigest(token) });
  return { token, guest, room, expiresAt };
}
