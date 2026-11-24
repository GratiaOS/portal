import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hub, RoomStore, nodeSqlite } from '../dist/index.js';
import { forGuests, pseudonymOf } from '../dist/guests.js';

const T0 = Date.parse('2026-11-10T10:00:00Z');

function setup() {
  const store = new RoomStore(nodeSqlite(':memory:'), { now: () => new Date(T0) });
  store.syncParticipants([{ kind: 'human', alias: 'Quartz' }]);
  store.syncConversations([{ id: 'guests', title: 'Guests', kind: 'guest' }]);
  const owl = store.createGuest({ alias: 'owl', room: 'guests', activeFrom: T0, expiresAt: T0 + 3_600_000, budget: 0, keyDigest: 'd' });
  return { store, owl, quartz: store.getParticipant('human:quartz') };
}

test('a person of the team speaks to guests under an animal, the same all day and never by name', () => {
  const { store, quartz } = setup();
  const turn = store.appendTurn({ conversationId: 'guests', speakerId: quartz.id, text: 'hello' });
  const seen = forGuests(store, turn, T0);
  assert.match(seen.speakerId, /^guest:[a-z]+-\d\d$/);
  assert.ok(!JSON.stringify(seen).includes('quartz'));
  assert.equal(seen.speakerId, forGuests(store, turn, T0 + 3_600_000).speakerId, 'the same an hour later');
  assert.equal(pseudonymOf(quartz.id, T0), pseudonymOf(quartz.id, T0 + 1000));
});

test('a guest is left as they are', () => {
  const { store, owl } = setup();
  const turn = store.appendTurn({ conversationId: 'guests', speakerId: owl.id, text: 'hi' });
  assert.equal(forGuests(store, turn, T0), turn);
});

test('in the guest room the team is as a guest too: whoever reads it, a person of the team speaks under their name of the day, and is told what it is', () => {
  const { store, owl, quartz } = setup();
  store.syncConversations([{ id: 'general', title: 'General' }, { id: 'guests', title: 'Guests', kind: 'guest' }]);
  const hub = new Hub(store, { graceMs: 20, now: () => T0 });
  const frames = (who) => {
    const wire = [];
    hub.subscribe(who, { write: (chunk) => wire.push(chunk), close() {} });
    return wire;
  };
  const mine = frames(quartz);
  const theirs = frames(owl);
  const hello = JSON.parse(/event: hello\ndata: (.*)\n/.exec(mine[0])[1]);
  assert.equal(hello.guestName, pseudonymOf(quartz.id, T0));
  assert.equal(JSON.parse(/event: hello\ndata: (.*)\n/.exec(theirs[0])[1]).guestName, undefined, 'a guest has no other name');

  hub.publish({ conversationId: 'guests', speakerId: quartz.id, text: 'in the guest room' });
  hub.publish({ conversationId: 'general', speakerId: quartz.id, text: 'in the team room' });
  const said = (wire) => wire.filter((c) => c.startsWith('event: message')).map((c) => JSON.parse(/data: (.*)\n/.exec(c)[1]));
  const [inGuests, inGeneral] = said(mine);
  assert.equal(inGuests.speakerId, `guest:${hello.guestName}`, 'the team reads the guest room as a guest does');
  assert.equal(inGeneral.speakerId, quartz.id, 'and its own room as itself');
  assert.deepEqual(said(theirs).map((t) => t.speakerId), [`guest:${hello.guestName}`], 'a guest hears the guest room only, in the same name');
  assert.ok(!said(theirs).some((t) => /quartz/i.test(JSON.stringify(t))));
});
