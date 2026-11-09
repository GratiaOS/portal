import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isGuestPath, leavingEndsAVisit, opensToGuests, stepThrough } from './guest.ts';

const answer = (status: number, body?: unknown) => () => Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status }));
const down = () => Promise.reject(new TypeError('network down'));

test('the path that steps through by itself is /guest, with or without a closing slash, and nothing else', () => {
  assert.equal(isGuestPath('/guest'), true);
  assert.equal(isGuestPath('/guest/'), true);
  for (const other of ['/', '/guests', '/guest/x', '/api/guest', '/Guest', '']) assert.equal(isGuestPath(other), false, other);
});

test('a portal has a door only if its health says so', async () => {
  assert.equal(await opensToGuests(answer(200, { ok: true, guests: true })), true);
  assert.equal(await opensToGuests(answer(200, { ok: true })), false);
  assert.equal(await opensToGuests(answer(200, { ok: true, guests: 'yes' })), false);
  assert.equal(await opensToGuests(answer(500)), false);
  assert.equal(await opensToGuests(down), false);
});

test('stepping through gives the key, the name and the room, asking nothing', async () => {
  const entered = { token: 'k'.repeat(43), participant: { id: 'guest:owl', alias: 'owl', kind: 'guest' }, room: { id: 'guests', title: 'Guests' }, expiresAt: 5 };
  let seen: { url: string; init?: RequestInit } | undefined;
  const result = await stepThrough((url, init) => {
    seen = { url: String(url), init };
    return Promise.resolve(new Response(JSON.stringify(entered), { status: 201 }));
  });
  assert.deepEqual(result, { ok: true, entered });
  assert.equal(seen?.url, '/api/guest');
  assert.equal(seen?.init?.method, 'POST');
  assert.equal(seen?.init?.body, undefined); // nothing is sent: not a name, not a mail
  assert.equal(seen?.init?.headers, undefined); // and no key: this is the door for those who have none
});

test('each way the door can say no is told apart', async () => {
  assert.deepEqual(await stepThrough(answer(503)), { ok: false, reason: 'full' });
  assert.deepEqual(await stepThrough(answer(429)), { ok: false, reason: 'slow' });
  assert.deepEqual(await stepThrough(answer(401)), { ok: false, reason: 'closed' }); // a portal with no door answers as any route with no key
  assert.deepEqual(await stepThrough(answer(404)), { ok: false, reason: 'closed' });
  assert.deepEqual(await stepThrough(answer(500)), { ok: false, reason: 'away' });
  assert.deepEqual(await stepThrough(down), { ok: false, reason: 'away' });
  assert.deepEqual(await stepThrough(() => Promise.resolve(new Response('not json', { status: 201 }))), { ok: false, reason: 'away' });
});

test('leaving ends a visit when they are a visitor, and before the stream has said who they are, by how the page kept that they came in', () => {
  assert.equal(leavingEndsAVisit('guest', false), true);
  assert.equal(leavingEndsAVisit('human', true), false, 'who they are, once known, beats what was remembered');
  assert.equal(leavingEndsAVisit(undefined, true), true, 'before the first word of the stream, the page remembers');
  assert.equal(leavingEndsAVisit(undefined, false), false);
});
