import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { GUEST_NAMES, Hub, RoomStore, createApp, createAuthenticator, nodeSqlite, parseConfig } from '../dist/index.js';

const T0 = Date.parse('2026-11-06T12:00:00Z');
const MIN = 60_000;
const ZEUS = 'z'.repeat(24);

function setup({ guests = { room: 'guests', maxActive: 3, minutes: 30, perCaller: { count: 2, perMinutes: 10 } }, config = true, guestHints } = {}) {
  let now = T0;
  const store = new RoomStore(nodeSqlite(':memory:'), { now: () => new Date(now) });
  store.syncParticipants([{ kind: 'human', alias: 'Zeus' }, { kind: 'companion', alias: 'Nova' }]);
  store.syncConversations([{ id: 'general', title: 'General' }, { id: 'guests', title: 'Guests', kind: 'guest' }]);
  const hub = new Hub(store, { graceMs: 20, now: () => now });
  const known = new Map([[ZEUS, 'human:zeus']]);
  const app = createApp(store, hub, {
    version: '0.0.0-test',
    authenticate: (token) => known.get(token),
    rateLimit: { messages: 1000, windowMs: 10_000 },
    callerFromHome: true,
    hints: { companion: 'Nova', examples: ['what does the team earn?'] }, // the team's, in the team's own words
    guestHints,
    ...(config ? { guests: { nova: { enabled: false, questions: 5, perHour: 60 }, ...guests } } : {}),
    now: () => now,
  });
  const call = (path, { token, caller = 'c1', ...init } = {}) =>
    app(new Request(`http://portal.test${path}`, { ...init, headers: { 'x-portal-caller': caller, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } }));
  const enter = (caller) => call('/api/guest', { method: 'POST', caller });
  return { store, hub, call, enter, advance: (ms) => (now += ms) };
}

test('without a guest room in the config there is no door', async () => {
  const { enter } = setup({ config: false });
  assert.equal((await enter()).status, 401); // as any route without a key
});

test('a visitor comes in with a name, a room and a key, and the key is the guest, in that room only', async () => {
  const { enter, call, store } = setup();
  const res = await enter();
  assert.equal(res.status, 201);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const { token, participant, room, expiresAt } = await res.json();
  assert.equal(participant.kind, 'guest');
  assert.ok(GUEST_NAMES.includes(participant.alias));
  assert.deepEqual(room, { id: 'guests', title: 'Guests' });
  assert.equal(expiresAt, T0 + 30 * MIN);
  assert.ok(token.length >= 43);

  assert.equal((await (await call('/api/me', { token })).json()).id, participant.id);
  assert.deepEqual((await (await call('/api/rooms', { token })).json()).rooms.map((r) => r.id), ['guests']);
  const said = await call('/api/rooms/guests/messages', { token, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'hello' }) });
  assert.equal(said.status, 201);
  assert.equal((await call('/api/rooms/general/messages', { token })).status, 404); // the team's room does not exist for them
  assert.equal((await call('/api/gaps', { token })).status, 403);

  // only the digest of the key is kept
  assert.equal(store.participantByGuestKey(createHash('sha256').update(token).digest('hex')), participant.id);
  assert.equal(store.participantByGuestKey(token), undefined);
});

test('names of the hour are all different, and never one that is taken', async () => {
  const { enter } = setup({ guests: { room: 'guests', maxActive: 1000, minutes: 30, perCaller: { count: 100, perMinutes: 10 } } });
  const names = [];
  for (let i = 0; i < GUEST_NAMES.length + 5; i += 1) names.push((await (await enter()).json()).participant.alias);
  assert.equal(new Set(names).size, names.length);
  assert.ok(names.some((n) => /-2$/.test(n))); // the names ran out once, and the next ones carry a number
});

test('the portal hosts as many guests as it is told, and a guest who has gone makes room', async () => {
  const { enter, advance } = setup({ guests: { room: 'guests', maxActive: 2, minutes: 30, perCaller: { count: 100, perMinutes: 10 } } });
  assert.equal((await enter('a')).status, 201);
  assert.equal((await enter('b')).status, 201);
  const full = await enter('c');
  assert.equal(full.status, 503);
  assert.equal(full.headers.get('retry-after'), '60');
  assert.match((await full.json()).error, /guest room is full/);

  advance(30 * MIN); // their time is over
  assert.equal((await enter('c')).status, 201);
});

test('one caller may bring in only so many guests, and another caller is not asked to wait', async () => {
  const { enter, advance } = setup({ guests: { room: 'guests', maxActive: 100, minutes: 30, perCaller: { count: 2, perMinutes: 10 } } });
  assert.equal((await enter('same')).status, 201);
  assert.equal((await enter('same')).status, 201);
  const refused = await enter('same');
  assert.equal(refused.status, 429);
  assert.ok(Number(refused.headers.get('retry-after')) > 0);
  assert.equal((await enter('someone-else')).status, 201);
  advance(10 * MIN + 1);
  assert.equal((await enter('same')).status, 201);
});

test('a guest whose time is over has a key that opens nothing, not even a stream, and it is not a wrong key', async () => {
  const { enter, call, advance } = setup();
  const { token } = await (await enter()).json();
  advance(31 * MIN);
  for (const path of ['/api/me', '/api/rooms', '/api/rooms/guests/messages', '/api/stream']) assert.equal((await call(path, { token })).status, 401, path);

  // an expired key is a known key, not a guess: however often it is tried, the same address is not locked out for it
  for (let i = 0; i < 25; i += 1) await call('/api/me', { token });
  assert.equal((await call('/api/me', { token: ZEUS })).status, 200);
});

test('a wrong key is still a wrong key, for a guest as for anyone', async () => {
  const { call } = setup();
  assert.equal((await call('/api/me', { token: 'x'.repeat(43) })).status, 401);
});

test('the guest room of the config must exist and be of kind guest', () => {
  const config = (guests, rooms) => parseConfig({ participants: [{ kind: 'human', alias: 'Zeus', token: ZEUS }], rooms, guests, dbPath: ':memory:' }, '/base');
  const rooms = [{ id: 'general', title: 'General' }, { id: 'guests', title: 'Guests', kind: 'guest' }];
  const ok = config({ room: 'guests' }, rooms).guests;
  assert.deepEqual(ok, { room: 'guests', maxActive: 20, minutes: 60, perCaller: { count: 5, perMinutes: 10 }, nova: { enabled: false, questions: 5, perHour: 60 } });
  assert.throws(() => config({ room: 'nowhere' }, rooms), /there is no room/);
  assert.throws(() => config({ room: 'general' }, rooms), /kind "guest"/);
  assert.throws(() => config({ room: 'guests', minutes: 0 }, rooms), /minutes/);
  assert.equal(config(undefined, rooms).guests, undefined);
  assert.ok(createAuthenticator);
});

test('the portal says it has a door only when it has one, and a guest is told of their companion\'s examples, never the team\'s', async () => {
  const none = setup({ config: false });
  assert.equal('guests' in (await (await none.call('/api/health')).json()), false);

  const { enter, call } = setup();
  assert.equal((await (await call('/api/health')).json()).guests, true);
  const { token } = await (await enter()).json();
  assert.deepEqual(await (await call('/api/hints', { token: ZEUS })).json(), { companion: 'Nova', examples: ['what does the team earn?'] });
  // a guest is told of none while the companion is off for guests, and never of the team's
  assert.deepEqual(await (await call('/api/hints', { token })).json(), { companion: null, examples: [] });

  // and of their companion's own when she is on
  const on = setup({ guestHints: { companion: 'Nova', examples: ['what is El portal?'] } });
  const guest = await (await on.enter()).json();
  assert.deepEqual(await (await on.call('/api/hints', { token: guest.token })).json(), { companion: 'Nova', examples: ['what is El portal?'] });
});

test('a visitor who steps through is announced to those already in the room, so that they can say who else is here', async () => {
  const { enter, hub, store } = setup();
  const first = await (await enter()).json();
  const sink = { chunks: [], write(chunk) { this.chunks.push(chunk); } };
  hub.subscribe(store.getParticipant(first.participant.id), sink);
  const second = await (await enter()).json();
  const heard = sink.chunks.join('').split('\n\n').filter((block) => block.includes('event: participant')).map((block) => JSON.parse(block.split('\n').find((l) => l.startsWith('data: ')).slice(6)).id);
  assert.deepEqual(heard, [second.participant.id]);
  hub.close();
});
