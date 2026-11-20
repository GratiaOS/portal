import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CALLER_HEADER, Hub, RoomStore, VERSION, createApp, createAuthenticator, nodeSqlite, parseConfig } from '../dist/index.js';
import { fakeSink } from './helpers.mjs';

// RFC 002 (drop), §8: the holder burns a packet of their frequency at once and for good; nobody else can, and every page of the holder drops it.

const ZEUS = 'z'.repeat(24);
const HERA = 'h'.repeat(24);
const START = Date.UTC(2026, 10, 18, 9, 0, 0);

function open({ withDrops = true } = {}) {
  const clock = { t: START };
  const now = () => clock.t;
  const config = parseConfig(
    {
      participants: [
        { kind: 'human', alias: 'Zeus', token: ZEUS },
        { kind: 'human', alias: 'Hera', token: HERA },
        { kind: 'companion', alias: 'Nova' },
      ],
      rooms: [{ id: 'general', title: 'General' }],
      dbPath: ':memory:',
      ...(withDrops
        ? {
            drops: {
              frequencies: [
                { freq: '99.6', title: '🎁 CTT', holder: 'Zeus' },
                { freq: '36.9', holder: 'Hera' },
              ],
              capacity: 3,
            },
          }
        : {}),
    },
    '/base',
  );
  const store = new RoomStore(nodeSqlite(':memory:'), { now: () => new Date(clock.t) });
  store.syncParticipants(config.participants.map(({ kind, alias }) => ({ kind, alias })));
  store.syncConversations(config.rooms);
  const hub = new Hub(store, { graceMs: 25 });
  const handle = createApp(store, hub, { version: VERSION, authenticate: createAuthenticator(config), drops: config.drops, callerFromHome: true, now, stream: { heartbeatMs: 20 } });
  let caller = 0;
  const call = (method, path, { token, body, headers = {} } = {}) =>
    handle(
      new Request(`http://portal.test${path}`, {
        method,
        headers: { [CALLER_HEADER]: `203.0.113.${(caller += 1) % 250}`, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  return {
    clock,
    store,
    hub,
    zeus: (path, more) => call('GET', path, { token: ZEUS, ...more }),
    hera: (path, more) => call('GET', path, { token: HERA, ...more }),
    anonymous: (path, more) => call('GET', path, more),
    call,
    /** What anyone, with no key, leaves on a frequency. */
    drop: (to, text, more = {}) => call('POST', '/api/drops/ingest', { body: { to, payload: { body: text }, ...more } }),
    who: (id) => store.getParticipant(id),
    close: () => hub.close(),
  };
}

async function within(work, options) {
  const room = open(options);
  try {
    await work(room);
  } finally {
    room.close();
  }
}


const idsOf = async (res) => (await res.json()).drops.map((d) => d.id);
const burn = (room, id, freq = '99.6', token = ZEUS) => room.call('DELETE', `/api/drops/${id}${freq === null ? '' : `?freq=${freq}`}`, { token });

test('the holder burns a packet: it is gone at once, from the read and from the file, and the answer is empty', () =>
  within(async (room) => {
    await room.drop('99.6', 'keep');
    room.clock.t += 5000;
    await room.drop('99.6', 'burn me');
    const [newest, older] = await idsOf(await room.zeus('/api/drops?freq=99.6'));
    const res = await burn(room, newest);
    assert.equal(res.status, 204);
    assert.equal(await res.text(), '');
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await idsOf(await room.zeus('/api/drops?freq=99.6')), [older]);
    assert.equal(room.store.countDrops('99.6'), 1);
  }));

test('burning is idempotent: a packet that is already gone is a success too, and so is one that never was', () =>
  within(async (room) => {
    await room.drop('99.6', 'x');
    const [id] = await idsOf(await room.zeus('/api/drops?freq=99.6'));
    assert.equal((await burn(room, id)).status, 204);
    assert.equal((await burn(room, id)).status, 204);
    assert.equal((await burn(room, 99999)).status, 204);
  }));

test('only the holder burns: another person, and a frequency nobody holds, get the 403 a read gets, and the packet stays', () =>
  within(async (room) => {
    await room.drop('99.6', 'for zeus');
    const [id] = await idsOf(await room.zeus('/api/drops?freq=99.6'));
    const refused = [await burn(room, id, '99.6', HERA), await burn(room, id, '12.3', ZEUS), await burn(room, id, '36.9', ZEUS), await burn(room, id, '12.3', HERA)];
    const bodies = [];
    for (const res of refused) {
      assert.equal(res.status, 403);
      bodies.push(await res.text());
    }
    assert.equal(new Set(bodies).size, 1, 'held by another and held by no one are told alike');
    assert.deepEqual(await idsOf(await room.zeus('/api/drops?freq=99.6')), [id]);
    // a gone packet and a living one are not told apart to someone who does not hold the frequency
    assert.equal((await burn(room, 99999, '99.6', HERA)).status, 403);
  }));

test('the id is of the frequency named: burning another frequency\'s id from one\'s own burns nothing', () =>
  within(async (room) => {
    await room.drop('36.9', 'hera');
    const [id] = await idsOf(await room.hera('/api/drops?freq=36.9'));
    assert.equal((await burn(room, id, '99.6', ZEUS)).status, 204); // success for the holder of 99.6, and nothing of 36.9 touched
    assert.deepEqual(await idsOf(await room.hera('/api/drops?freq=36.9')), [id]);
  }));

test('a key is needed, a visitor is refused, and the shape of the request is checked', () =>
  within(async (room) => {
    assert.equal((await room.call('DELETE', '/api/drops/1?freq=99.6')).status, 401);
    assert.equal((await room.call('DELETE', '/api/drops/1?freq=99.6', { token: 'x'.repeat(24) })).status, 401);
    for (const path of ['/api/drops/1', '/api/drops/1?freq=99', '/api/drops/1?freq=1000.0']) assert.equal((await room.call('DELETE', path, { token: ZEUS })).status, 400, path);
    assert.equal((await room.call('DELETE', '/api/drops/abc?freq=99.6', { token: ZEUS })).status, 404);
    const wrong = await room.call('GET', '/api/drops/1?freq=99.6', { token: ZEUS });
    assert.equal(wrong.status, 405);
    assert.equal(wrong.headers.get('allow'), 'DELETE');
  }));

test('a portal with no drops block has no such route', () =>
  within(
    async (room) => {
      assert.equal((await burn(room, 1)).status, 404);
    },
    { withDrops: false },
  ));

test('a burn is told to every connection of the holder, as the frequency and the id and nothing of the words, and to no one else', () =>
  within(async (room) => {
    const [a, b, hera] = [fakeSink(), fakeSink(), fakeSink()];
    room.hub.subscribe(room.who('human:zeus'), a);
    room.hub.subscribe(room.who('human:zeus'), b);
    room.hub.subscribe(room.who('human:hera'), hera);
    await room.drop('99.6', 'secret words');
    const [id] = await idsOf(await room.zeus('/api/drops?freq=99.6'));
    assert.equal((await burn(room, id)).status, 204);
    for (const sink of [a, b]) {
      const gone = sink.frames().filter((f) => f.event === 'drop-gone');
      assert.deepEqual(gone.map((f) => [f.id, f.data]), [[undefined, { freq: '99.6', id }]]);
      assert.equal(sink.chunks.join('').includes('secret'), false);
    }
    assert.equal(hera.frames().filter((f) => f.event === 'drop-gone').length, 0);
  }));

test('nothing is told for a burn that was refused, or of a packet that was already gone', () =>
  within(async (room) => {
    const zeus = fakeSink();
    room.hub.subscribe(room.who('human:zeus'), zeus);
    await room.drop('99.6', 'x');
    const [id] = await idsOf(await room.zeus('/api/drops?freq=99.6'));
    await burn(room, id, '99.6', HERA); // refused
    assert.equal(zeus.frames().filter((f) => f.event === 'drop-gone').length, 0);
    await burn(room, id);
    await burn(room, id); // already gone
    assert.equal(zeus.frames().filter((f) => f.event === 'drop-gone').length, 1);
  }));
