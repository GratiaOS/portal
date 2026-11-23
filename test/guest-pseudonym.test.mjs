import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomStore, nodeSqlite } from '../dist/index.js';
import { forGuests, pseudonymOf } from '../dist/guests.js';

const T0 = Date.parse('2026-11-10T10:00:00Z');

function setup() {
  const store = new RoomStore(nodeSqlite(':memory:'), { now: () => new Date(T0) });
  store.syncParticipants([{ kind: 'human', alias: 'Zeus' }]);
  store.syncConversations([{ id: 'guests', title: 'Guests', kind: 'guest' }]);
  const owl = store.createGuest({ alias: 'owl', room: 'guests', activeFrom: T0, expiresAt: T0 + 3_600_000, budget: 0, keyDigest: 'd' });
  return { store, owl, zeus: store.getParticipant('human:zeus') };
}

test('a person of the team speaks to guests under an animal, the same all day and never by name', () => {
  const { store, zeus } = setup();
  const turn = store.appendTurn({ conversationId: 'guests', speakerId: zeus.id, text: 'hello' });
  const seen = forGuests(store, turn, T0);
  assert.match(seen.speakerId, /^guest:[a-z]+-\d\d$/);
  assert.ok(!JSON.stringify(seen).includes('zeus'));
  assert.equal(seen.speakerId, forGuests(store, turn, T0 + 3_600_000).speakerId, 'the same an hour later');
  assert.equal(pseudonymOf(zeus.id, T0), pseudonymOf(zeus.id, T0 + 1000));
});

test('a guest is left as they are', () => {
  const { store, owl } = setup();
  const turn = store.appendTurn({ conversationId: 'guests', speakerId: owl.id, text: 'hi' });
  assert.equal(forGuests(store, turn, T0), turn);
});
