import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CALLER_HEADER, Hub, RoomStore, VERSION, createApp, createAuthenticator, nodeSqlite, parseConfig } from '../dist/index.js';
import { fakeSink } from './helpers.mjs';

// RFC 002 (drop), step 3: the holder reads what is left on their frequency, and is told, with nothing in it, that something came.

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

// --- reading ---

test('the holder reads what is left on their frequency, newest first, with its title, and nothing of when it was left', () =>
  within(async ({ zeus, drop, clock }) => {
    const empty = await zeus('/api/drops?freq=99.6');
    assert.equal(empty.status, 200);
    assert.equal(empty.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await empty.json(), { freq: '99.6', title: '🎁 CTT', drops: [] });

    assert.equal((await drop('99.6', 'first', { fade: '2h' })).status, 204);
    clock.t += 5000;
    assert.equal((await drop('99.6', 'second', { payload: { body: 'second', format: 'patch' } })).status, 204);
    const { freq, title, drops } = await (await zeus('/api/drops?freq=99.6')).json();
    assert.deepEqual([freq, title], ['99.6', '🎁 CTT']);
    assert.deepEqual(drops.map((d) => d.payload.body), ['second', 'first']);
    assert.deepEqual(drops[0].payload, { body: 'second', format: 'patch' });
    assert.deepEqual(Object.keys(drops[0]).sort(), ['fadesAt', 'id', 'payload', 'type']); // no sender, no time it was left
    assert.equal(drops[0].type, 'drop');
    assert.equal(typeof drops[0].id, 'string');
    assert.equal(drops[1].fadesAt, START + 2 * 3_600_000);
  }));

test('a packet sealed with a sigil says which, and one without says nothing of it', () =>
  within(async ({ zeus, drop, clock }) => {
    await drop('99.6', 'plain');
    clock.t += 5000;
    await drop('99.6', 'sealed', { payload: { body: 'sealed', sigil: '🦁' } });
    const { drops } = await (await zeus('/api/drops?freq=99.6')).json();
    assert.deepEqual(drops.map((d) => d.payload), [{ body: 'sealed', format: 'note', sigil: '🦁' }, { body: 'plain', format: 'note' }]);
  }));

test('a title is the frequency unless the config says', () =>
  within(async ({ hera }) => {
    assert.deepEqual(await (await hera('/api/drops?freq=36.9')).json(), { freq: '36.9', title: '36.9', drops: [] });
  }));

test('only the holder reads: anyone else, and a frequency nobody holds, get the same 403', () =>
  within(async ({ zeus, hera, drop }) => {
    await drop('99.6', 'for zeus');
    const others = [await hera('/api/drops?freq=99.6'), await zeus('/api/drops?freq=36.9'), await zeus('/api/drops?freq=12.3'), await hera('/api/drops?freq=12.3')];
    const bodies = [];
    for (const res of others) {
      assert.equal(res.status, 403);
      bodies.push(await res.text());
    }
    assert.equal(new Set(bodies).size, 1, 'a frequency held by another and one held by no one are told alike');
    assert.equal(bodies[0].includes('for zeus'), false);
  }));

test('a key is needed to read', () =>
  within(async ({ anonymous, call }) => {
    assert.equal((await anonymous('/api/drops?freq=99.6')).status, 401);
    assert.equal((await call('GET', '/api/drops?freq=99.6', { token: 'x'.repeat(24) })).status, 401);
  }));

test('the frequency asked for must be one, and only GET is answered', () =>
  within(async ({ zeus, call }) => {
    for (const path of ['/api/drops', '/api/drops?freq=', '/api/drops?freq=99', '/api/drops?freq=99.66', '/api/drops?freq=1000.0']) assert.equal((await zeus(path)).status, 400, path);
    const res = await call('POST', '/api/drops?freq=99.6', { token: ZEUS, body: {} });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET');
  }));

test('a portal with no drops block has no such route, once the key is good', () =>
  within(
    async ({ zeus, anonymous }) => {
      assert.equal((await anonymous('/api/drops?freq=99.6')).status, 401);
      assert.equal((await zeus('/api/drops?freq=99.6')).status, 404);
    },
    { withDrops: false },
  ));

test('a read lets go of what has faded, at once, and from the file', () =>
  within(async ({ zeus, drop, clock, store }) => {
    await drop('99.6', 'brief', { fade: '1m' });
    clock.t += 59_999;
    assert.equal((await (await zeus('/api/drops?freq=99.6')).json()).drops.length, 1);
    clock.t += 1;
    assert.deepEqual((await (await zeus('/api/drops?freq=99.6')).json()).drops, []);
    assert.equal(store.countDrops('99.6'), 0);
  }));

test('a read does not take a drop away: it can be read again, until it fades', () =>
  within(async ({ zeus, drop }) => {
    await drop('99.6', 'stays');
    for (let i = 0; i < 3; i += 1) assert.deepEqual((await (await zeus('/api/drops?freq=99.6')).json()).drops.map((d) => d.payload.body), ['stays']);
  }));

// --- the pulse ---

const heard = (sink) => sink.frames().filter((f) => f.event === 'drop');

test('a drop taken on a held frequency is told, with only its frequency, to the holder and to no one else', () =>
  within(async ({ hub, who, drop }) => {
    const zeus = fakeSink();
    const hera = fakeSink();
    hub.subscribe(who('human:zeus'), zeus);
    hub.subscribe(who('human:hera'), hera);

    assert.equal((await drop('99.6', 'secret words')).status, 204);
    assert.deepEqual(heard(zeus).map((f) => [f.event, f.id, f.data]), [['drop', undefined, { freq: '99.6' }]]); // no id: not part of the cursor of what is said
    assert.deepEqual(heard(hera), []);
    assert.equal(zeus.chunks.join('').includes('secret'), false); // nothing of the text

    assert.equal((await drop('36.9', 'for hera')).status, 204);
    assert.deepEqual(heard(hera).map((f) => f.data), [{ freq: '36.9' }]);
    assert.equal(heard(zeus).length, 1); // and zeus was not told of hera's
  }));

test('every connection of the holder is told, and a person with the portal open in two places hears it twice', () =>
  within(async ({ hub, who, drop }) => {
    const [a, b] = [fakeSink(), fakeSink()];
    hub.subscribe(who('human:zeus'), a);
    hub.subscribe(who('human:zeus'), b);
    await drop('99.6', 'x');
    assert.equal(heard(a).length, 1);
    assert.equal(heard(b).length, 1);
  }));

test('nothing is told for a frequency nobody holds, and nothing for a drop that was refused', () =>
  within(async ({ hub, who, drop }) => {
    const zeus = fakeSink();
    hub.subscribe(who('human:zeus'), zeus);
    assert.equal((await drop('12.3', 'x')).status, 204); // not held: taken and kept nowhere
    assert.equal((await drop('99', 'x')).status, 400);
    assert.equal((await drop('99.6', '')).status, 400);
    assert.equal((await drop('99.6', 'x', { fade: '7w' })).status, 400);
    assert.equal((await drop('99.6', 'a'.repeat(9000))).status, 413);
    assert.deepEqual(heard(zeus), []);
  }));

test('a holder who comes later is not told of what came before: the view lists it, the pulse is only for now', () =>
  within(async ({ hub, who, drop }) => {
    await drop('99.6', 'before');
    const late = fakeSink();
    hub.subscribe(who('human:zeus'), late, 0); // asking for all it missed of what is said
    assert.deepEqual(late.events(), ['hello']);
  }));

test('the pulse reaches the page over the real stream', () =>
  within(async ({ zeus, drop }) => {
    const res = await zeus('/api/stream');
    assert.equal(res.status, 200);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let seen = '';
    const read = async (until) => {
      const end = Date.now() + 3000;
      while (!until(seen)) {
        assert.ok(Date.now() < end, `not heard in time: ${JSON.stringify(seen)}`);
        const next = await reader.read();
        assert.equal(next.done, false);
        seen += decoder.decode(next.value);
      }
    };
    await read((text) => text.includes('event: hello'));
    assert.equal(seen.includes('event: drop'), false);
    await drop('99.6', 'x');
    await read((text) => text.includes('event: drop'));
    assert.match(seen, /event: drop\ndata: \{"freq":"99\.6"\}\n\n/);
    await reader.cancel();
  }));

test('the hub says it to one participant and keeps nothing', () => {
  const store = new RoomStore(nodeSqlite(':memory:'));
  store.syncParticipants([
    { kind: 'human', alias: 'Zeus' },
    { kind: 'human', alias: 'Hera' },
  ]);
  store.syncConversations([{ id: 'general', title: 'General' }]);
  const hub = new Hub(store, { graceMs: 25 });
  const [z, h] = [fakeSink(), fakeSink()];
  hub.subscribe(store.getParticipant('human:zeus'), z);
  hub.subscribe(store.getParticipant('human:hera'), h);
  hub.notifyDrop('human:zeus', '99.6');
  hub.notifyDrop('human:nobody', '99.6'); // a participant who is not here is not an error
  assert.deepEqual(heard(z).map((f) => f.data), [{ freq: '99.6' }]);
  assert.deepEqual(heard(h), []);
  assert.equal(store.lastSeq(), 0); // it is not a turn, and moves no cursor
  hub.close();
});
