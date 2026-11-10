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
