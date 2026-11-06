import assert from 'node:assert/strict';
import { test } from 'node:test';
import { effectivePermissions } from '../dist/index.js';

const T = 1_000_000;
const guestRole = { id: 'guest', purpose: 'a visitor in one room', permissions: ['read', 'write', 'ask'], boundaries: ['sees no other room', 'sees no one outside it'] };
const room = (over = {}) => ({ id: 'guests', kind: 'guest', createdAt: T, expiresAt: T + 3600_000, allowed: ['read', 'write', 'ask', 'presence'], ...over });
const binding = (over = {}) => ({ id: 'b1', roomId: 'guests', participantId: 'human:guest-owl', roleId: 'guest', activeFrom: T, expiresAt: T + 1800_000, budget: 5, ledgerId: 'l1', ...over });
const at = T + 60_000;

test('what is effective is what the role has and the room allows', () => {
  assert.deepEqual(effectivePermissions(binding(), guestRole, room(), at), ['read', 'write', 'ask']);
  // the room allows less than the role: the room wins
  assert.deepEqual(effectivePermissions(binding(), guestRole, room({ allowed: ['read'] }), at), ['read']);
  // the role has what the room does not allow: it is not given
  assert.deepEqual(effectivePermissions(binding(), { ...guestRole, permissions: ['read', 'presence'] }, room({ allowed: ['read'] }), at), ['read']);
});

test('outside its own room a binding allows nothing: a guest has no authority in the team room', () => {
  const team = room({ id: 'general', kind: 'team', expiresAt: T + 10 * 3600_000 });
  assert.deepEqual(effectivePermissions(binding(), guestRole, team, at), []);
  assert.deepEqual(effectivePermissions(binding({ roomId: 'general' }), guestRole, room(), at), []);
});

test('a binding of another role allows nothing', () => {
  assert.deepEqual(effectivePermissions(binding({ roleId: 'member' }), guestRole, room(), at), []);
});

test('it holds only inside the time of the binding and the time of the room', () => {
  assert.deepEqual(effectivePermissions(binding(), guestRole, room(), T - 1), []); // before both
  assert.deepEqual(effectivePermissions(binding({ activeFrom: T + 5000 }), guestRole, room(), T + 4999), []); // before the binding
  assert.deepEqual(effectivePermissions(binding(), guestRole, room(), T + 1800_000 - 1), ['read', 'write', 'ask']); // the last moment
  assert.deepEqual(effectivePermissions(binding(), guestRole, room(), T + 1800_000), []); // the binding ends here, not after
  assert.deepEqual(effectivePermissions(binding({ expiresAt: T + 3600_000 }), guestRole, room(), T + 3600_000), []); // so does the room
});

test('a binding cannot outlive its room', () => {
  assert.deepEqual(effectivePermissions(binding({ expiresAt: T + 3600_000 + 1 }), guestRole, room(), at), []);
});

test('a window that is not a bounded, ordered pair of finite numbers gives nothing', () => {
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.deepEqual(effectivePermissions(binding({ expiresAt: bad }), guestRole, room(), at), []);
    assert.deepEqual(effectivePermissions(binding({ activeFrom: bad }), guestRole, room(), at), []);
    assert.deepEqual(effectivePermissions(binding(), guestRole, room({ expiresAt: bad }), at), []);
    assert.deepEqual(effectivePermissions(binding(), guestRole, room(), bad), []);
  }
  assert.deepEqual(effectivePermissions(binding({ activeFrom: T + 100, expiresAt: T + 100 }), guestRole, room(), T + 100), []); // opens as it closes
  assert.deepEqual(effectivePermissions(binding({ activeFrom: T + 200, expiresAt: T + 100 }), guestRole, room(), T + 150), []); // closes before it opens
  assert.deepEqual(effectivePermissions(binding(), guestRole, room({ createdAt: T + 10, expiresAt: T }), at), []);
});
