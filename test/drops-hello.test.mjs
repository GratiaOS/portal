import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Hub, RoomStore, nodeSqlite, parseConfig } from '../dist/index.js';
import { fakeSink } from './helpers.mjs';

// RFC 002, step 4: the page learns, in `hello`, which frequency the person holds: the identity of the box, never what is in it.

const config = parseConfig(
  {
    participants: [
      { kind: 'human', alias: 'Zeus', token: 'z'.repeat(24) },
      { kind: 'human', alias: 'Hera', token: 'h'.repeat(24) },
      { kind: 'human', alias: 'Ares', token: 'a'.repeat(24) },
      { kind: 'companion', alias: 'Nova' },
    ],
    rooms: [
      { id: 'general', title: 'General' },
      { id: 'parking', title: 'Guests', kind: 'guest' },
    ],
    guests: { room: 'parking' },
    dbPath: ':memory:',
    drops: {
      frequencies: [
        { freq: '99.6', title: '🎁 CTT', holder: 'Zeus' },
        { freq: '36.9', holder: 'Hera' },
      ],
    },
  },
  '/base',
);

function open(options = {}) {
  const store = new RoomStore(nodeSqlite(':memory:'));
  store.syncParticipants(config.participants.map(({ kind, alias }) => ({ kind, alias })));
  store.syncConversations(config.rooms);
  const hub = new Hub(store, { graceMs: 25, ...options });
  const hello = (id) => {
    const sink = fakeSink();
    hub.subscribe(store.getParticipant(id), sink);
    return sink.frames().find((f) => f.event === 'hello').data;
  };
  return { store, hub, hello };
}

test('hello says which frequency a person holds, with its title: the title is the frequency unless the config says', () => {
  const { hub, hello } = open({ drops: config.drops });
  assert.deepEqual(hello('human:zeus').heldFrequency, { freq: '99.6', title: '🎁 CTT' });
  assert.deepEqual(hello('human:hera').heldFrequency, { freq: '36.9', title: '36.9' });
  hub.close();
});

test('a person who holds none is told so (null), and a portal with no drops says nothing of them at all', () => {
  const withDrops = open({ drops: config.drops });
  const ares = withDrops.hello('human:ares');
  assert.equal('heldFrequency' in ares, true);
  assert.equal(ares.heldFrequency, null);
  withDrops.hub.close();

  const without = open();
  assert.equal('heldFrequency' in without.hello('human:zeus'), false);
  without.hub.close();
});

test('hello tells no one of another person\'s frequency, in any part of it', () => {
  const { hub, hello } = open({ drops: config.drops });
  const text = JSON.stringify(hello('human:ares'));
  assert.equal(text.includes('99.6') || text.includes('36.9') || text.includes('CTT'), false);
  const zeus = JSON.stringify(hello('human:zeus'));
  assert.equal(zeus.includes('36.9'), false);
  hub.close();
});

test('a visitor is told nothing of drops, not even that there are none', () => {
  const { store, hub } = open({ drops: config.drops });
  const guest = store.addGuest('owl');
  const sink = fakeSink();
  hub.subscribe(guest, sink);
  const { data } = sink.frames().find((f) => f.event === 'hello');
  assert.equal('heldFrequency' in data, false);
  hub.close();
});
