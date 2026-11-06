/**
 * Who may do what, where: the one place that says it. A person of the team may do everything, everywhere; a guest may do what a binding
 * gives them, in the room it is for, while it lasts, and nothing else. Anything not named here is not allowed to a guest, so a new
 * route or a new kind of event is closed to guests until someone opens it on purpose.
 */

import { PERMISSIONS, effectivePermissions } from './authority.js';
import type { Permission, Role, RoomContext } from './authority.js';
import type { Conversation, Participant } from './domain.js';
import type { RoomStore } from './store.js';

/** What a guest is given: to read and to write in the guest room. Asking the companion is not here yet. */
export const GUEST_ROLE: Role = {
  id: 'guest',
  purpose: 'a visitor, in one room',
  permissions: ['read', 'write'],
  boundaries: ['sees no other room', 'sees none of the team', 'does not ask the companion', 'reads none of what the knowledge lacks'],
};

/** A room as a place of authority. A team room allows a bound role nothing; a guest room allows what a guest role may have. It has no end here: a binding does. */
export function roomContext(room: Conversation): RoomContext {
  return {
    id: room.id,
    kind: room.kind,
    createdAt: Date.parse(room.createdAt),
    expiresAt: Number.MAX_SAFE_INTEGER,
    allowed: room.kind === 'guest' ? ['read', 'write'] : [],
  };
}

/** What this participant may do in this room at this instant. */
export function permissionsIn(
  store: Pick<RoomStore, 'getConversation' | 'bindingsOf'>,
  who: Participant,
  roomId: string,
  now: number,
): readonly Permission[] {
  if (who.kind !== 'guest') return PERMISSIONS; // the team: everything, everywhere
  const room = store.getConversation(roomId);
  if (!room) return [];
  const context = roomContext(room);
  const given = new Set<Permission>();
  for (const binding of store.bindingsOf(who.id)) for (const permission of effectivePermissions(binding, GUEST_ROLE, context, now)) given.add(permission);
  return PERMISSIONS.filter((permission) => given.has(permission));
}

export function canIn(store: Pick<RoomStore, 'getConversation' | 'bindingsOf'>, who: Participant, roomId: string, permission: Permission, now: number): boolean {
  return permissionsIn(store, who, roomId, now).includes(permission);
}

/** Whether the participant is in their time at all: the team always; a guest while one of their bindings lasts. After it, nothing of theirs opens. */
export function isLive(store: Pick<RoomStore, 'bindingsOf'>, who: Participant, now: number): boolean {
  return who.kind !== 'guest' || store.bindingsOf(who.id).some((binding) => binding.activeFrom <= now && now < binding.expiresAt);
}

/** When the last of a guest's bindings that is in its time ends (milliseconds since the epoch), or `undefined` for someone who has no end. */
export function endOfGuest(store: Pick<RoomStore, 'bindingsOf'>, who: Participant, now: number): number | undefined {
  if (who.kind !== 'guest') return undefined;
  const live = store.bindingsOf(who.id).filter((binding) => binding.activeFrom <= now && now < binding.expiresAt);
  return live.length ? Math.max(...live.map((binding) => binding.expiresAt)) : now;
}

/** Whom a participant may know of at all: the team knows everyone; a guest knows other guests and the companions, never the team's people. */
export function mayKnow(who: Participant, other: Participant): boolean {
  return who.kind !== 'guest' || other.kind === 'guest' || other.kind === 'companion';
}
