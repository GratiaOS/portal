/**
 * What a participant may do in a room, and for how long: authority is contextual, temporary and bounded. A participant does not
 * own a role; it receives the temporary right to exercise one in one room, and outside that room it has nothing.
 *
 * 🗿 trace
 * Name from:  the Contextual Authority of @gratiaos/identity-core: RoleTemplate, Context, ContextBinding, getEffectiveAuthority.
 * Root:       @gratiaos/identity-core 0.2.0, public as a package on npm; its source is in a private repository, so there is no permalink.
 * Path:       dist/authority.js in the tarball of @gratiaos/identity-core 0.2.0 (https://unpkg.com/@gratiaos/identity-core@0.2.0/dist/authority.js)
 * Same idea:  a role is a template of permissions; a context is a bounded space and time with the permissions it allows; a binding is the
 *             temporary right of one participant to exercise one role in one context, with a budget; what is effective is the
 *             intersection of the role's and the context's permissions, inside both lifetimes, and nothing at all when anything fails.
 * Different:  the context is a room of the portal, of its two kinds (`team`, `guest`), not `garden`, `bank` or `campfire`; the permissions
 *             are the portal's four; the names are the portal's (camelCase, `room`); the budget is counted by the portal, in questions to
 *             the companion, against a ledger it keeps; this module only says what is allowed, it stores nothing.
 * Not copied: written new for the portal's own types and names (MPL-2.0, as the package is). The checks are the same ones, because they are
 *             the idea; no code is taken, and the portal keeps no dependency on the package.
 */

/** What may be done in a room: read what is said there (its history and its stream), write in it, ask the companion in it, see who is in it. */
export type Permission = 'read' | 'write' | 'ask' | 'presence';
export const PERMISSIONS: readonly Permission[] = ['read', 'write', 'ask', 'presence'];

/** A team room stays; a guest room is temporary. */
export type RoomKind = 'team' | 'guest';

/** The definition of a role. It holds no state. */
export type Role = Readonly<{
  id: string;
  purpose: string;
  permissions: readonly Permission[];
  /** What this role will not do, in words, for whoever reads it. */
  boundaries: readonly string[];
}>;

/** A room as a place of authority: its time, and the permissions it allows to anyone in it. Times are milliseconds since the epoch. */
export type RoomContext = Readonly<{
  /** The room's own id. */
  id: string;
  kind: RoomKind;
  createdAt: number;
  expiresAt: number;
  allowed: readonly Permission[];
}>;

/** The temporary right of one participant to exercise one role in one room. */
export type Binding = Readonly<{
  id: string;
  roomId: string;
  participantId: string;
  roleId: string;
  activeFrom: number;
  expiresAt: number;
  /** How many questions to the companion this binding may cause; the ledger that counts them is the portal's. */
  budget: number;
  ledgerId: string;
}>;

/** A window is valid when both bounds are finite and it opens before it closes (NaN compares false with everything, so it is checked). */
function validWindow(from: number, to: number): boolean {
  return Number.isFinite(from) && Number.isFinite(to) && from < to;
}

/**
 * What the binding allows at this instant, in this room: nothing when the binding is not of this room and this role, when the room or the
 * binding is not in its time, or when the binding would outlive its room. Otherwise the permissions that the role has and the room allows.
 * Whether the budget is spent is for the ledger to say, apart from this.
 */
export function effectivePermissions(binding: Binding, role: Role, room: RoomContext, now: number): readonly Permission[] {
  if (binding.roomId !== room.id || binding.roleId !== role.id) return [];
  if (!Number.isFinite(now) || !validWindow(room.createdAt, room.expiresAt) || now < room.createdAt || now >= room.expiresAt) return [];
  if (!validWindow(binding.activeFrom, binding.expiresAt) || binding.expiresAt > room.expiresAt || now < binding.activeFrom || now >= binding.expiresAt) {
    return [];
  }
  const allowed = new Set<Permission>(room.allowed);
  return role.permissions.filter((permission) => allowed.has(permission));
}
