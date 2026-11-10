import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomStore, nodeSqlite } from '../dist/index.js';

// What a guest says leaves one turn at a time: after `trailMinutes`, whatever else happens in the room.
const T0 = Date.parse('2026-11-10T10:00:00Z');
const MIN = 60_000;
const TRAIL = 15 * MIN;

function setup() {
  const clock = { now: T0 };
  const store = new RoomStore(nodeSqlite(':memory:'), { now: () => new Date(clock.now) });
  store.syncParticipants([{ kind: 'human', alias: 'Zeus' }]);
  store.syncConversations([{ id: 'general', title: 'General' }, { id: 'guests', title: 'Guests', kind: 'guest' }]);
  const owl = store.createGuest({ alias: 'owl', room: 'guests', activeFrom: T0, expiresAt: T0 + 60 * MIN, budget: 5, keyDigest: 'd-owl' });
  const say = (id, room, text) => store.appendTurn({ conversationId: room, speakerId: id, text });
  return { store, clock, owl, say };
}

test('each turn goes when it is older than the trail, while the guest is still inside their time', () => {
  const { store, clock, owl, say } = setup();
  say(owl.id, 'guests', 'first');
  clock.now += 10 * MIN;
  say(owl.id, 'guests', 'second');
  clock.now += 5 * MIN; // the first is now 15 minutes old, the second 5
  assert.equal(store.forgetGuestTrail(TRAIL), 1);
  assert.deepEqual(store.listTurns('guests').map((t) => t.text), ['second']);
  assert.equal(store.forgetGuestTrail(TRAIL), 0, 'and nothing twice');
  assert.equal(store.countActiveGuests(clock.now), 1, 'the key is another clock: the guest is still in');
});

test('a room where no one writes any more empties itself', () => {
  const { store, clock, owl, say } = setup();
  say(owl.id, 'guests', 'a word');
  clock.now += TRAIL + 1;
  assert.equal(store.forgetGuestTrail(TRAIL), 1);
  assert.deepEqual(store.listTurns('guests'), []);
});

test('a team room is never touched by the trail', () => {
  const { store, clock, say } = setup();
  const zeus = store.listParticipants().find((p) => p.alias === 'Zeus');
  say(zeus.id, 'general', 'a word of the team');
  clock.now += 24 * 60 * MIN;
  assert.equal(store.forgetGuestTrail(TRAIL), 0);
  assert.equal(store.listTurns('general').length, 1);
});

test('a guest who reconnects is not replayed a turn past the trail, even before the portal lets it go', async () => {
  const { Hub } = await import('../dist/index.js');
  const { fakeSink } = await import('./helpers.mjs');
  const { store, clock, owl, say } = setup();
  const hub = new Hub(store, { graceMs: 20, now: () => clock.now, trailMinutes: 15 });
  say(owl.id, 'guests', 'old');
  clock.now += 10 * MIN;
  say(owl.id, 'guests', 'recent');
  clock.now += 6 * MIN; // the first is 16 minutes old (past the trail), the second 6; nothing has been let go yet
  const sink = fakeSink();
  hub.subscribe(store.getParticipant(owl.id), sink, '0');
  const said = sink.frames().filter((f) => f.event === 'message').map((f) => f.data.text);
  assert.deepEqual(said, ['recent']);
  assert.equal(sink.frames()[0].data.trailMinutes, 15, 'and the hello tells the guest how long what is said lasts');
});
