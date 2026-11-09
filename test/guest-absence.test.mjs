import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomStore, nodeSqlite } from '../dist/index.js';

// A guest room ends by absence: some minutes after the last visitor's time is over, what was said there and who was there are let go.
const T0 = Date.parse('2026-11-09T12:00:00Z');
const MIN = 60_000;
const FIVE = 5 * MIN;

function setup() {
  const clock = { now: T0 };
  const store = new RoomStore(nodeSqlite(':memory:'), { now: () => new Date(clock.now) });
  store.syncParticipants([{ kind: 'human', alias: 'Zeus' }]);
  store.syncConversations([{ id: 'general', title: 'General' }, { id: 'guests', title: 'Guests', kind: 'guest' }]);
  const enter = (alias, minutes, digest) =>
    store.createGuest({ alias, room: 'guests', activeFrom: clock.now, expiresAt: clock.now + minutes * MIN, budget: 5, keyDigest: digest });
  const say = (id, room, text) => store.appendTurn({ conversationId: room, speakerId: id, text });
  return { store, clock, enter, say };
}

test('while a guest is in their time the room is never touched, however long it has been quiet', () => {
  const { store, clock, enter, say } = setup();
  const owl = enter('owl', 60, 'd-owl');
  say(owl.id, 'guests', 'still here');
  clock.now += 50 * MIN;
  assert.deepEqual(store.forgetEmptyGuestRooms(FIVE), { turns: 0, guests: 0 });
  assert.equal(store.listTurns('guests').length, 1);
});

test('after the last guest\'s time is over and some minutes more, the room is empty and no one of them is on the roster', () => {
  const { store, clock, enter, say } = setup();
  const owl = enter('owl', 10, 'd-owl');
  const fox = enter('fox', 20, 'd-fox');
  say(owl.id, 'guests', 'hello');
  say(fox.id, 'guests', 'hi');
  clock.now += 20 * MIN + FIVE - 1;
  assert.deepEqual(store.forgetEmptyGuestRooms(FIVE), { turns: 0, guests: 0 }, 'not yet: the last one is still inside the minutes more');
  clock.now += 1;
  assert.deepEqual(store.forgetEmptyGuestRooms(FIVE), { turns: 2, guests: 2 });
  assert.deepEqual(store.listTurns('guests'), []);
  assert.deepEqual(store.listParticipants().map((p) => p.alias), ['Zeus']);
  assert.equal(store.participantByGuestKey('d-owl'), undefined, 'their keys go too');
  assert.equal(store.countActiveGuests(clock.now), 0);
});

test('a guest who comes in after the end finds an empty room, and a new name is no one\'s return', () => {
  const { store, clock, enter, say } = setup();
  const owl = enter('owl', 10, 'd-owl');
  say(owl.id, 'guests', 'a thought of the first visit');
  clock.now += 10 * MIN + FIVE;
  store.forgetEmptyGuestRooms(FIVE);
  const next = enter('owl', 10, 'd-next');
  assert.equal(store.listTurns('guests').length, 0);
  assert.equal(store.bindingsOf(next.id).length, 1, 'one binding, with nothing before it');
});

test('a team room is never touched, and a portal with no guest room has nothing to end', () => {
  const { store, clock, enter, say } = setup();
  const zeus = store.listParticipants().find((p) => p.alias === 'Zeus');
  say(zeus.id, 'general', 'a word of the team');
  const owl = enter('owl', 1, 'd-owl');
  say(owl.id, 'guests', 'a word of a guest');
  clock.now += 10 * MIN;
  store.forgetEmptyGuestRooms(FIVE);
  assert.equal(store.listTurns('general').length, 1);
  assert.equal(store.listTurns('guests').length, 0);
});

test('the questions a guest asked stay counted for the portal\'s hour, and name no one', () => {
  const { store, clock, enter } = setup();
  const owl = enter('owl', 1, 'd-owl');
  const ledger = store.bindingsOf(owl.id)[0].ledgerId;
  assert.equal(store.spendQuestion({ ledgerId: ledger, budget: 5, now: clock.now, perHour: 1 }), 'ok');
  clock.now += 10 * MIN;
  store.forgetEmptyGuestRooms(FIVE);
  assert.equal(store.spendQuestion({ ledgerId: 'another', budget: 5, now: clock.now, perHour: 1 }), 'hour', 'the ceiling is the portal\'s, not the guest\'s');
});
