import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RoomStore, nodeSqlite, parseConfig } from '../dist/index.js';

// A person who is renamed keeps what they said and who they are.
function setup() {
  const store = new RoomStore(nodeSqlite(':memory:'));
  store.syncParticipants([{ kind: 'human', alias: 'magni', sign: '🎞️' }, { kind: 'human', alias: 'saw' }]);
  store.syncConversations([{ id: 'general', title: 'General' }]);
  return store;
}

test('a renamed person keeps their turns, the mentions of them, and their sign', () => {
  const store = setup();
  store.appendTurn({ conversationId: 'general', speakerId: 'human:magni', text: 'hola' });
  store.appendTurn({ conversationId: 'general', speakerId: 'human:saw', text: '@magni are you there?' });
  assert.deepEqual(store.listTurns('general')[1].mentions, ['human:magni']);

  store.syncParticipants([{ kind: 'human', alias: 'rdm', sign: '🎞️', renamedFrom: 'magni' }, { kind: 'human', alias: 'saw' }]);

  assert.deepEqual(store.listParticipants().map((p) => p.alias).sort(), ['rdm', 'saw'], 'no ghost of the old name');
  const turns = store.listTurns('general');
  assert.equal(turns[0].speakerId, 'human:rdm');
  assert.equal(turns[0].text, 'hola', 'what they said is as it was');
  assert.deepEqual(turns[1].mentions, ['human:rdm']);
  assert.equal(store.getParticipant('human:rdm').sign, '🎞️');
});

test('the turns stay append-only after a rename', () => {
  const store = setup();
  store.appendTurn({ conversationId: 'general', speakerId: 'human:magni', text: 'hola' });
  store.syncParticipants([{ kind: 'human', alias: 'rdm', renamedFrom: 'magni' }, { kind: 'human', alias: 'saw' }]);
  assert.throws(() => store.db.run("UPDATE turns SET text = 'changed'"), /append-only/);
});

test('a config that still says renamedFrom changes nothing the second time', () => {
  const store = setup();
  store.appendTurn({ conversationId: 'general', speakerId: 'human:magni', text: 'hola' });
  const who = [{ kind: 'human', alias: 'rdm', renamedFrom: 'magni' }, { kind: 'human', alias: 'saw' }];
  store.syncParticipants(who);
  store.syncParticipants(who);
  assert.equal(store.listParticipants().length, 2);
  assert.equal(store.listTurns('general').length, 1);
});

test('a rename of someone who was never there just makes the new person; into a name already in use it moves nothing', () => {
  const store = setup();
  store.appendTurn({ conversationId: 'general', speakerId: 'human:magni', text: 'hola' });
  store.syncParticipants([{ kind: 'human', alias: 'newcomer', renamedFrom: 'nobody' }]);
  assert.ok(store.getParticipant('human:newcomer'));
  store.syncParticipants([{ kind: 'human', alias: 'saw', renamedFrom: 'magni' }]); // saw is there already: the turns of magni stay his
  assert.equal(store.listTurns('general')[0].speakerId, 'human:magni');
  assert.ok(store.getParticipant('human:magni'));
});

test('the config says who may be renamed: a person, from one who is no longer there', () => {
  const base = { participants: [{ kind: 'human', alias: 'rdm', token: 'r'.repeat(24), renamedFrom: 'magni' }], rooms: [{ id: 'g', title: 'G' }], dbPath: ':memory:' };
  assert.equal(parseConfig(base, '/').participants[0].renamedFrom, 'magni');
  assert.throws(() => parseConfig({ ...base, participants: [...base.participants, { kind: 'human', alias: 'magni', token: 'm'.repeat(24) }] }, '/'), /renamedFrom/);
  assert.throws(() => parseConfig({ ...base, participants: [{ ...base.participants[0], renamedFrom: 'rdm' }] }, '/'), /same as the alias/);
});

// A room that is renamed keeps what was said in it.
function rooms() {
  const store = new RoomStore(nodeSqlite(':memory:'));
  store.syncParticipants([{ kind: 'human', alias: 'saw' }]);
  store.syncConversations([{ id: 'general', title: 'Plaza' }, { id: 'guests', title: 'Parking', kind: 'guest' }]);
  return store;
}
const RENAMED = [{ id: 'plaza', title: 'Plaza', renamedFrom: 'general' }, { id: 'parking', title: 'Parking', kind: 'guest', renamedFrom: 'guests' }];

test('a renamed room keeps its turns, the guests who are in it, what its knowledge lacked, and when it was made', () => {
  const store = rooms();
  store.appendTurn({ conversationId: 'general', speakerId: 'human:saw', text: 'see you in #general' });
  store.recordGap({ conversationId: 'general', question: 'where is the key?', why: 'model_found_nothing' });
  const owl = store.createGuest({ alias: 'owl', room: 'guests', activeFrom: 0, expiresAt: 9e15, budget: 0, keyDigest: 'd' });
  store.appendTurn({ conversationId: 'guests', speakerId: owl.id, text: 'hola' });
  const made = store.getConversation('general').createdAt;

  store.syncConversations(RENAMED);

  assert.deepEqual(store.listConversations().map((c) => c.id), ['plaza', 'parking'], 'no ghost of the old ids');
  assert.equal(store.listTurns('plaza')[0].text, 'see you in #general', 'what was said is as it was said');
  assert.equal(store.listTurns('parking')[0].speakerId, owl.id);
  assert.equal(store.bindingsOf(owl.id)[0].roomId, 'parking', 'a guest who is there stays there');
  assert.equal(store.listGaps()[0].conversationId, 'plaza');
  assert.equal(store.getConversation('plaza').createdAt, made);
  assert.equal(store.getConversation('parking').kind, 'guest');
  assert.throws(() => store.db.run("UPDATE turns SET text = 'changed'"), /append-only/, 'the turns stay append-only');
});

test('a config that still says renamedFrom for a room changes nothing the second time', () => {
  const store = rooms();
  store.appendTurn({ conversationId: 'general', speakerId: 'human:saw', text: 'hola' });
  store.syncConversations(RENAMED);
  store.syncConversations(RENAMED);
  assert.equal(store.listConversations().length, 2);
  assert.equal(store.listTurns('plaza').length, 1);
});

test('a rename of a room that was never there just makes the new room; into an id already in use it moves nothing', () => {
  const store = rooms();
  store.appendTurn({ conversationId: 'general', speakerId: 'human:saw', text: 'hola' });
  store.syncConversations([{ id: 'ops', title: 'Ops', renamedFrom: 'nowhere' }]);
  assert.ok(store.getConversation('ops'));
  store.syncConversations([{ id: 'ops', title: 'Ops', renamedFrom: 'general' }]); // ops is there already: what was said in general stays there
  assert.equal(store.listTurns('general').length, 1);
  assert.equal(store.listTurns('ops').length, 0);
});

test('the rooms are listed in the order of the config, and one it no longer names comes after', () => {
  const store = new RoomStore(nodeSqlite(':memory:'));
  store.syncConversations([{ id: 'plaza', title: 'Plaza' }, { id: 'parking', title: 'Parking' }, { id: 'attic', title: 'Attic' }]);
  assert.deepEqual(store.listConversations().map((c) => c.id), ['plaza', 'parking', 'attic']);
  store.syncConversations([{ id: 'plaza', title: 'Plaza' }, { id: 'attic', title: 'Attic' }]);
  assert.deepEqual(store.listConversations().map((c) => c.id), ['plaza', 'attic', 'parking']);
});

test('the config says which room may be renamed: from one that is no longer there, and once', () => {
  const base = { participants: [{ kind: 'human', alias: 'saw', token: 's'.repeat(24) }], rooms: [{ id: 'plaza', title: 'Plaza', renamedFrom: 'general' }], dbPath: ':memory:' };
  assert.equal(parseConfig(base, '/').rooms[0].renamedFrom, 'general');
  assert.throws(() => parseConfig({ ...base, rooms: [...base.rooms, { id: 'general', title: 'G' }] }, '/'), /renamedFrom/);
  assert.throws(() => parseConfig({ ...base, rooms: [{ id: 'plaza', title: 'Plaza', renamedFrom: 'plaza' }] }, '/'), /same as the id/);
  assert.throws(() => parseConfig({ ...base, rooms: [...base.rooms, { id: 'ops', title: 'Ops', renamedFrom: 'general' }] }, '/'), /the same one/);
  assert.throws(() => parseConfig({ ...base, rooms: [{ id: 'plaza', title: 'Plaza', renamedFrom: 'Not An Id' }] }, '/'), /not a valid room id/);
});
