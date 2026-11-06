import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hub, RoomStore, createApp, createAuthenticator, nodeSqlite, parseConfig } from '../dist/index.js';
import { fakeSink } from './helpers.mjs';

// A portal with a team (Zeus, Hera, Nova) in two team rooms, and one guest room: and a guest, bound to that room only, for an hour.
const T0 = Date.parse('2026-11-06T12:00:00Z');
const HOUR = 3600_000;
const TOKENS = { zeus: 'z'.repeat(24), owl: 'o'.repeat(24) };

function setup({ bind = true, now = () => T0 + 60_000 } = {}) {
  const store = new RoomStore(nodeSqlite(':memory:'), { now: () => new Date(T0) });
  store.syncParticipants([
    { kind: 'human', alias: 'Zeus' },
    { kind: 'human', alias: 'Hera' },
    { kind: 'companion', alias: 'Nova' },
  ]);
  store.syncConversations([
    { id: 'general', title: 'General' },
    { id: 'olympus', title: 'Olympus' },
    { id: 'guests', title: 'Guests', kind: 'guest' },
  ]);
  const owl = store.addGuest('owl');
  if (bind) store.addBinding({ id: 'b1', roomId: 'guests', participantId: owl.id, roleId: 'guest', activeFrom: T0, expiresAt: T0 + HOUR, budget: 5, ledgerId: 'l1' });
  const hub = new Hub(store, { graceMs: 20, now });
  // tokens by participant id, as the home would know them
  const byToken = new Map([[TOKENS.zeus, 'human:zeus'], [TOKENS.owl, owl.id]]);
  const app = createApp(store, hub, { version: '0.0.0-test', authenticate: (token) => byToken.get(token), rateLimit: { messages: 1000, windowMs: 10_000 }, now });
  const call = (token, path, init = {}) => app(new Request(`http://portal.test${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } }));
  const say = (token, room, text) => call(token, `/api/rooms/${room}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
  return { store, hub, owl, call, say, zeus: store.getParticipant('human:zeus'), hera: store.getParticipant('human:hera') };
}

test('a guest is told of the room they are bound to, and of no other', async () => {
  const { call } = setup();
  assert.deepEqual((await (await call(TOKENS.owl, '/api/rooms')).json()).rooms.map((r) => r.id), ['guests']);
  assert.deepEqual((await (await call(TOKENS.zeus, '/api/rooms')).json()).rooms.map((r) => r.id), ['general', 'guests', 'olympus']); // the team sees all
});

test('a guest reads and writes in their room, and a team room is, to them, a room that does not exist', async () => {
  const { call, say, store } = setup();
  store.appendTurn({ conversationId: 'general', speakerId: 'human:zeus', text: 'secret of the team' });

  assert.equal((await say(TOKENS.owl, 'guests', 'hello')).status, 201);
  assert.equal((await call(TOKENS.owl, '/api/rooms/guests/messages')).status, 200);

  const read = await call(TOKENS.owl, '/api/rooms/general/messages');
  assert.equal(read.status, 404);
  assert.match((await read.json()).error, /no conversation "general"/); // the same words as for a room that is not there
  assert.equal((await say(TOKENS.owl, 'general', 'let me in')).status, 404);
  assert.equal((await call(TOKENS.owl, '/api/rooms/nowhere/messages')).status, 404);
});

test('a guest with no binding is let in nowhere; and what ends in time is no authority', async () => {
  const none = setup({ bind: false });
  assert.equal((await none.call(TOKENS.owl, '/api/rooms')).status, 401);
  assert.equal((await none.say(TOKENS.owl, 'guests', 'hello')).status, 401);

  let now = T0 + 60_000;
  const timed = setup({ now: () => now });
  assert.equal((await timed.say(TOKENS.owl, 'guests', 'in time')).status, 201);
  now = T0 + HOUR; // the binding ends here
  assert.equal((await timed.say(TOKENS.owl, 'guests', 'too late')).status, 401);
  assert.equal((await timed.call(TOKENS.owl, '/api/rooms')).status, 401);
  assert.equal((await timed.call(TOKENS.owl, '/api/stream')).status, 401); // and it opens no stream, which would keep a connection for ever
});

test('what the knowledge lacked is not for a guest, and a guest has no sign', async () => {
  const { call } = setup();
  assert.equal((await call(TOKENS.owl, '/api/gaps')).status, 403);
  assert.equal((await call(TOKENS.zeus, '/api/gaps')).status, 200);
  const sign = await call(TOKENS.owl, '/api/me/sign', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sign: '🦉' }) });
  assert.ok(sign.status >= 400);
});

test('the stream tells a guest of their own room and of no one on the team', () => {
  const { hub, store, owl, zeus, hera } = setup();
  store.appendTurn({ conversationId: 'general', speakerId: zeus.id, text: 'before, in the team room' });
  store.appendTurn({ conversationId: 'guests', speakerId: owl.id, text: 'before, in the guest room' });

  const sink = fakeSink();
  hub.subscribe(owl, sink, 0); // asks for everything it missed

  const [hello, ...replayed] = sink.frames();
  assert.deepEqual(hello.data.conversations.map((c) => c.id), ['guests']);
  assert.deepEqual(hello.data.participants.map((p) => p.id).sort(), ['companion:nova', 'guest:owl']); // no Zeus, no Hera
  assert.deepEqual(hello.data.presence.map((p) => p.participantId).sort(), ['companion:nova', 'guest:owl']);
  assert.deepEqual(replayed.map((f) => f.data.text), ['before, in the guest room']); // what was missed, of their room only

  // what happens next: a turn in the team room, a turn in theirs, a team person arriving, a team person's sign
  hub.publish({ conversationId: 'general', speakerId: zeus.id, text: 'after, in the team room' });
  hub.publish({ conversationId: 'guests', speakerId: owl.id, text: 'after, in the guest room' });
  hub.subscribe(hera, fakeSink()); // Hera comes online
  hub.participantChanged({ ...hera, sign: '🦊' });
  hub.setActivity('companion:nova', 'general', 'thinking');
  hub.setActivity('companion:nova', 'guests', 'thinking');

  const later = sink.frames().slice(1 + replayed.length);
  assert.deepEqual(later.map((f) => f.event), ['message', 'activity']);
  assert.equal(later[0].data.text, 'after, in the guest room');
  assert.equal(later[1].data.conversationId, 'guests');
  hub.close();
});

test('the team is told everything, as before', () => {
  const { hub, store, owl, zeus } = setup();
  const sink = fakeSink();
  hub.subscribe(zeus, sink);
  const [hello] = sink.frames();
  assert.deepEqual(hello.data.conversations.map((c) => c.id), ['general', 'guests', 'olympus']);
  assert.equal(hello.data.participants.length, 4); // Zeus, Hera, Nova and the guest
  hub.publish({ conversationId: 'guests', speakerId: owl.id, text: 'a guest speaks' });
  hub.publish({ conversationId: 'general', speakerId: 'human:hera', text: 'the team speaks' });
  assert.deepEqual(sink.frames().slice(1).map((f) => f.data.text), ['a guest speaks', 'the team speaks']);
  hub.close();
});

test('a guest cannot be bound to a team room, and a room kind is "team" or "guest"', () => {
  const { store, owl } = setup({ bind: false });
  assert.throws(() => store.addBinding({ id: 'b2', roomId: 'general', participantId: owl.id, roleId: 'guest', activeFrom: T0, expiresAt: T0 + HOUR, budget: 1, ledgerId: 'l' }), /not a guest room/);
  assert.throws(() => store.syncConversations([{ id: 'odd', title: 'Odd', kind: 'visitors' }]), /unknown room kind/);
  const config = (kind) => parseConfig({ participants: [{ kind: 'human', alias: 'Zeus', token: 'z'.repeat(24) }], rooms: [{ id: 'g', title: 'G', kind }], dbPath: ':memory:' }, '/base');
  assert.equal(config('guest').rooms[0].kind, 'guest');
  assert.throws(() => config('visitors'), /"team" or "guest"/);
});

test('a guest cannot be declared in the config: a guest is made while the portal runs', () => {
  assert.throws(
    () => parseConfig({ participants: [{ kind: 'guest', alias: 'owl', token: 'o'.repeat(24) }], rooms: [{ id: 'g', title: 'G' }], dbPath: ':memory:' }, '/base'),
    /kind/,
  );
  assert.ok(createAuthenticator); // the home's authenticator knows tokens, not kinds; a guest's token is for the step that makes it
});

test('a guest is kept to one room: a renewal is welcome, a second room is refused', () => {
  const { store, owl } = setup();
  store.syncConversations([{ id: 'guests-two', title: 'Guests, two', kind: 'guest' }]);
  const more = { roomId: 'guests', participantId: owl.id, roleId: 'guest', activeFrom: T0 + HOUR, expiresAt: T0 + 2 * HOUR, budget: 5, ledgerId: 'l2' };
  store.addBinding({ id: 'renewal', ...more }); // the same room, later: the guest stays
  assert.throws(() => store.addBinding({ id: 'other', ...more, roomId: 'guests-two' }), /guest of another room/);
  assert.deepEqual(store.bindingsOf(owl.id).map((b) => b.roomId), ['guests', 'guests']);
});

test('a guest who types a name of the team learns nothing of the team from what comes back', async () => {
  const { say, store, call } = setup();
  const turn = (await (await say(TOKENS.owl, 'guests', 'is @zeus here? and @nova? and @hera?')).json()).turn;
  assert.deepEqual(turn.mentions, ['companion:nova']); // Nova is on their roster; Zeus and Hera are not
  assert.deepEqual(store.listTurns('guests').at(-1).mentions, ['companion:nova']); // nor is it kept the other way

  // and the team still resolves every name, as before
  store.syncConversations([{ id: 'general', title: 'General' }]);
  const team = (await (await say(TOKENS.zeus, 'general', 'ask @hera and @nova')).json()).turn;
  assert.deepEqual(team.mentions.sort(), ['companion:nova', 'human:hera']);
  assert.ok(call);
});

test('a guest\'s stream ends when their time does, and nothing is told to it after', async () => {
  let now = T0 + 60_000;
  const { hub, store, owl } = setup({ now: () => now });
  // the guest of setup has an hour; another, bound for 60 ms only, is the one whose stream must end
  const brief = store.addGuest('wren');
  store.addBinding({ id: 'b-wren', roomId: 'guests', participantId: brief.id, roleId: 'guest', activeFrom: T0, expiresAt: now + 60, budget: 0, ledgerId: 'l10' });

  const sink = fakeSink();
  hub.subscribe(brief, sink);
  assert.equal(sink.closed, false);
  await new Promise((resolve) => setTimeout(resolve, 150)); // a little more than the 60 ms that are left
  assert.equal(sink.closed, true, 'the stream was closed when the binding ended');

  const before = sink.chunks.length;
  hub.publish({ conversationId: 'guests', speakerId: owl.id, text: 'said after' });
  assert.equal(sink.chunks.length, before, 'and nothing was told to it after');
  hub.close();
});

test('a guest is shown here while they are, and offline once they have gone, as people are', async () => {
  const { hub, store, owl } = setup();
  const other = store.addGuest('wren');
  store.addBinding({ id: 'bw', roomId: 'guests', participantId: other.id, roleId: 'guest', activeFrom: T0, expiresAt: T0 + HOUR, budget: 0, ledgerId: 'lw' });

  const sink = fakeSink();
  hub.subscribe(owl, sink);
  const stateOf = (frames, id) => frames.filter((f) => f.event === 'presence' && f.data.participantId === id).at(-1)?.data.state;
  assert.equal(sink.frames()[0].data.presence.find((p) => p.participantId === 'guest:wren').state, 'offline'); // not there yet

  const leaving = fakeSink();
  const close = hub.subscribe(other, leaving);
  assert.equal(stateOf(sink.frames(), 'guest:wren'), 'online');
  close();
  await new Promise((resolve) => setTimeout(resolve, 90)); // past the grace period
  assert.equal(stateOf(sink.frames(), 'guest:wren'), 'offline');
  hub.close();
});

test('those already here hear of a guest who has come in: the visitors, and the team', async () => {
  const { hub, store, owl, zeus } = setup();
  const sink = fakeSink();
  hub.subscribe(owl, sink);
  const team = fakeSink();
  hub.subscribe(zeus, team);

  const newcomer = store.addGuest('wren');
  hub.participantChanged(newcomer);
  assert.equal(sink.frames().filter((f) => f.event === 'participant').at(-1)?.data.id, 'guest:wren'); // a visitor hears of the one who came
  assert.equal(team.frames().filter((f) => f.event === 'participant').at(-1)?.data.id, 'guest:wren');
  hub.close();
});
