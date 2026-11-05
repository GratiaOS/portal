import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { Hub, RoomStore, nodeSqlite, SKIN_CONTRACT, VERSION, createApp, CALLER_HEADER, toNodeListener, createAuthenticator, parseConfig, startRoom } from '../dist/index.js';
import { Collector, sleep } from './helpers.mjs';

const TOKENS = { zeus: 'r'.repeat(24), hera: 'a'.repeat(24) };

const configFor = (extra = {}) =>
  parseConfig(
    {
      participants: [
        { kind: 'human', alias: 'Zeus', token: TOKENS.zeus },
        { kind: 'human', alias: 'Hera', token: TOKENS.hera },
        { kind: 'companion', alias: 'Nova' },
      ],
      rooms: [
        { id: 'general', title: 'General' },
        { id: 'olympus', title: 'Olympus' },
      ],
      dbPath: ':memory:',
      ...extra,
    },
    '/base',
  );

/** A room on a free port, with the HTTP layer only; `hub` can be swapped for a broken one. */
async function start({ hub: wrap, ...options } = {}) {
  const config = configFor();
  const store = new RoomStore(nodeSqlite(':memory:'));
  store.syncParticipants(config.participants.map(({ kind, alias }) => ({ kind, alias })));
  store.syncConversations(config.rooms);
  const hub = new Hub(store, { graceMs: 25 });
  const server = createServer(
    toNodeListener(
      createApp(store, wrap ? wrap(hub) : hub, {
        version: VERSION,
        authenticate: createAuthenticator(config),
        rateLimit: { messages: 1000, windowMs: 10_000 },
        stream: { heartbeatMs: 20 },
        ...options,
      }),
    ),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const as = (token) => (path, init = {}) => fetch(base + path, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
  return {
    base,
    store,
    hub,
    zeus: as(TOKENS.zeus),
    hera: as(TOKENS.hera),
    anonymous: (path, init) => fetch(base + path, init),
    async close() {
      hub.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

const say = (call, channel, body, headers = { 'Content-Type': 'application/json' }) =>
  call(`/api/rooms/${channel}/messages`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

async function within(work) {
  const room = await start(work.options);
  try {
    await work.run(room);
  } finally {
    await room.close();
  }
}

test('health needs no token, says which room this is and the contracts it keeps, and every answer says not to sniff it', () =>
  within({
    async run({ anonymous }) {
      const res = await anonymous('/api/health');
      assert.equal(res.status, 200);
      const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
      assert.equal(VERSION, version); // the version is the package's, not a second number kept by hand
      assert.deepEqual(await res.json(), { ok: true, version, contracts: { skins: SKIN_CONTRACT } });
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    },
  }));

test('without a good token nothing in /api answers, and it says how to sign in', () =>
  within({
    async run({ anonymous, zeus, base }) {
      const attempts = [
        anonymous('/api/me'),
        anonymous('/api/me', { headers: { Authorization: 'Basic cmF6dmFuOnBhc3M=' } }),
        anonymous('/api/me', { headers: { Authorization: `Bearer ${TOKENS.zeus}x` } }),
        anonymous('/api/me', { headers: { Authorization: 'Bearer' } }),
        anonymous('/api/rooms'),
        anonymous('/api/gaps'),
        anonymous('/api/rooms/general/messages'),
        anonymous('/api/stream'),
        anonymous('/api/nothing-here'), // not even whether it exists
      ];
      for (const res of await Promise.all(attempts)) {
        assert.equal(res.status, 401);
        assert.equal(res.headers.get('www-authenticate'), 'Bearer realm="portal"');
        assert.deepEqual(await res.json(), { error: 'unauthorized' });
      }
      assert.equal((await fetch(`${base}/index.html`)).status, 404);
      assert.equal((await zeus('/api/nothing-here')).status, 404);
    },
  }));

test('me and rooms', () =>
  within({
    async run({ zeus, hera }) {
      const res = await zeus('/api/me');
      assert.equal(res.status, 200);
      assert.match(res.headers.get('content-type'), /^application\/json/);
      assert.equal(res.headers.get('cache-control'), 'no-store');
      assert.deepEqual(await res.json(), { id: 'human:zeus', kind: 'human', alias: 'Zeus', capabilities: [] });
      assert.equal((await (await hera('/api/me')).json()).id, 'human:hera');

      const { rooms } = await (await zeus('/api/rooms')).json();
      assert.deepEqual(rooms.map((c) => [c.id, c.status, c.visibility]), [
        ['general', 'open', 'private'],
        ['olympus', 'open', 'private'],
      ]);
    },
  }));

test('hints: who can be called and with what, for the box where people write; nothing without a companion', () =>
  within({
    options: { hints: { companion: 'Nova', examples: ['ce e ambrozia?'] } },
    async run({ zeus, anonymous }) {
      assert.equal((await anonymous('/api/hints')).status, 401); // like the rest of /api
      assert.deepEqual(await (await zeus('/api/hints')).json(), { companion: 'Nova', examples: ['ce e ambrozia?'] });
      assert.equal((await zeus('/api/hints', { method: 'POST' })).status, 405);
    },
  }).then(() =>
    within({
      async run({ zeus }) {
        assert.deepEqual(await (await zeus('/api/hints')).json(), { companion: null, examples: [] });
      },
    }),
  ));

test('a message is from whoever the token says, and is read back as history, a page at a time', () =>
  within({
    async run({ zeus, hera }) {
      const res = await say(zeus, 'general', { text: '@nova hei', speakerId: 'human:hera' }); // the body cannot speak for someone else
      assert.equal(res.status, 201);
      const { turn } = await res.json();
      assert.equal(turn.speakerId, 'human:zeus');
      assert.deepEqual(turn.mentions, ['companion:nova']);
      assert.equal(turn.seq, 1);

      for (const text of ['doi', 'trei', 'patru']) await say(hera, 'general', { text });
      await say(hera, 'olympus', { text: 'în altă parte' });

      const all = (await (await zeus('/api/rooms/general/messages')).json()).turns;
      assert.deepEqual(all.map((t) => t.text), ['@nova hei', 'doi', 'trei', 'patru']);

      const last = (await (await zeus('/api/rooms/general/messages?limit=2')).json()).turns;
      assert.deepEqual(last.map((t) => t.text), ['trei', 'patru']);
      const before = (await (await zeus(`/api/rooms/general/messages?limit=2&before=${last[0].seq}`)).json()).turns;
      assert.deepEqual(before.map((t) => t.text), ['@nova hei', 'doi']);

      assert.equal((await zeus('/api/rooms/general/messages?before=abc')).status, 400);
      assert.equal((await zeus('/api/rooms/general/messages?limit=-1')).status, 400);
      assert.equal((await zeus('/api/rooms/nowhere/messages')).status, 404);
    },
  }));

test('a message that is not right is refused with a reason', () =>
  within({
    options: { maxBodyBytes: 300 },
    async run({ zeus, store }) {
      const refused = async (status, res, pattern) => {
        assert.equal(res.status, status);
        assert.match((await res.json()).error, pattern);
      };
      await refused(400, await say(zeus, 'general', {}), /text/);
      await refused(400, await say(zeus, 'general', { text: 5 }), /text/);
      await refused(400, await say(zeus, 'general', '[1, 2]'), /text/);
      await refused(400, await say(zeus, 'general', 'not json'), /valid JSON/);
      await refused(400, await say(zeus, 'general', { text: '   ' }), /empty/);
      await refused(415, await say(zeus, 'general', '{"text":"salut"}', { 'Content-Type': 'text/plain' }), /application\/json/);
      await refused(415, await say(zeus, 'general', '{"text":"salut"}', {}), /application\/json/);
      await refused(413, await say(zeus, 'general', { text: 'x'.repeat(400) }), /too large/);
      await refused(404, await say(zeus, 'nowhere', { text: 'salut' }), /no conversation/);
      await refused(400, await zeus('/api/rooms/%E0%A4%A/messages'), /bad room id/);

      store.setConversationStatus('general', 'closed');
      await refused(409, await say(zeus, 'general', { text: 'salut' }), /closed/);
      assert.equal(store.lastSeq(), 0); // nothing got in
    },
  }));

test('a message may be 4000 characters, even ones that take two bytes each, and not one more', () =>
  within({
    async run({ zeus }) {
      assert.equal((await say(zeus, 'general', { text: 'é'.repeat(4000) })).status, 201); // 8 KB on the wire, well inside the body limit
      const res = await say(zeus, 'general', { text: 'é'.repeat(4001) });
      assert.equal(res.status, 400);
      assert.match((await res.json()).error, /longer than 4000/);
    },
  }));

test('what the knowledge could not answer can be read by whoever is signed in, and says nothing about who asked', () =>
  within({
    async run({ zeus, hera, store }) {
      assert.deepEqual(await (await zeus('/api/gaps')).json(), { gaps: [] });
      store.recordGap({ conversationId: 'olympus', question: 'Putem sări pasul cu Styx?', why: 'model_found_nothing' });
      store.recordGap({ conversationId: 'olympus', question: 'putem sări pasul cu Styx?', why: 'model_found_nothing' });

      const { gaps } = await (await hera('/api/gaps?limit=5')).json();
      assert.equal(gaps.length, 1);
      assert.deepEqual(Object.keys(gaps[0]).sort(), ['asked', 'conversationId', 'firstDay', 'lastDay', 'question', 'sources', 'why']);
      assert.equal(gaps[0].asked, 2);
      assert.equal((await zeus('/api/gaps?limit=abc')).status, 400);
      assert.equal((await zeus('/api/gaps', { method: 'POST' })).status, 405);
    },
  }));

test('the wrong method says which ones are right', () =>
  within({
    async run({ zeus }) {
      const cases = [
        ['/api/me', 'POST', 'GET'],
        ['/api/rooms', 'DELETE', 'GET'],
        ['/api/rooms/general/messages', 'DELETE', 'GET, POST'],
        ['/api/stream', 'POST', 'GET'],
      ];
      for (const [path, method, allow] of cases) {
        const res = await zeus(path, { method });
        assert.equal(res.status, 405, `${method} ${path}`);
        assert.equal(res.headers.get('allow'), allow);
      }
    },
  }));

test('too many messages in a short time: told to wait, and only that person waits', () => {
  let now = 5_000_000;
  return within({
    options: { rateLimit: { messages: 3, windowMs: 10_000 }, now: () => now },
    async run({ zeus, hera }) {
      for (let i = 0; i < 3; i += 1) assert.equal((await say(zeus, 'general', { text: `m${i}` })).status, 201);

      const refused = await say(zeus, 'general', { text: 'prea mult' });
      assert.equal(refused.status, 429);
      assert.equal(refused.headers.get('retry-after'), '10');
      assert.match((await refused.json()).error, /slow down/);

      assert.equal((await say(hera, 'general', { text: 'eu pot' })).status, 201);
      assert.equal((await zeus('/api/rooms/general/messages')).status, 200); // reading is never limited

      now += 10_001;
      assert.equal((await say(zeus, 'general', { text: 'din nou' })).status, 201);
    },
  });
});

test('what was sent before the portal began again still counts: a restart, or an object that slept, gives no second window', async () => {
  const config = configFor();
  const store = new RoomStore(nodeSqlite(':memory:'));
  store.syncParticipants(config.participants.map(({ kind, alias }) => ({ kind, alias })));
  store.syncConversations(config.rooms);
  const hub = new Hub(store, { graceMs: 25 });
  const open = () => createApp(store, hub, { version: VERSION, authenticate: createAuthenticator(config), rateLimit: { messages: 3, windowMs: 60_000 } });
  const post = (app, token, text) =>
    app(new Request('http://portal.local/api/rooms/general/messages', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) }));
  try {
    const before = open();
    for (let i = 0; i < 3; i += 1) assert.equal((await post(before, TOKENS.zeus, `m${i}`)).status, 201);

    const after = open(); // the same store, a new handler: what a restart does
    assert.equal((await post(after, TOKENS.zeus, 'din nou')).status, 429);
    assert.equal((await post(after, TOKENS.hera, 'eu pot')).status, 201); // only the one who sent them waits
  } finally {
    hub.close();
  }
});

test('a person sets their own sign, everyone hears it live, and only theirs: the body never says whose', () =>
  within({
    async run({ zeus, hera }) {
      const abort = new AbortController();
      const stream = new Collector(await hera('/api/stream', { signal: abort.signal }));
      await stream.waitFor((t) => t.includes('event: hello'));

      const put = (call, body) => call('/api/me/sign', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const set = await put(zeus, { sign: '🫁', participantId: 'human:hera' }); // a body that names another is not heard
      assert.equal(set.status, 200);
      assert.equal((await set.json()).participant.sign, '🫁');
      await stream.waitFor((t) => /event: participant\ndata: \{"id":"human:zeus"[^\n]*"sign":"🫁"/.test(t));
      assert.equal((await (await hera('/api/me')).json()).sign, undefined); // Hera's is untouched
      assert.equal((await (await zeus('/api/me')).json()).sign, '🫁');

      assert.equal((await put(zeus, { sign: null })).status, 200); // let go
      assert.equal((await (await zeus('/api/me')).json()).sign, undefined);
      assert.equal((await put(zeus, { sign: 'leu' })).status, 400);
      assert.equal((await put(zeus, { mood: '🦁' })).status, 400);
      assert.equal((await zeus('/api/me/sign', { method: 'POST' })).status, 405);
      abort.abort();
    },
  }));

test('a sign changed many times in a minute is slowed down, for that person only', () =>
  within({
    async run({ zeus, hera }) {
      const put = (call, sign) => call('/api/me/sign', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sign }) });
      for (const sign of ['🦁', '🫁', '🧭', '🐸', '🌱', '☀️']) assert.equal((await put(zeus, sign)).status, 200);
      const refused = await put(zeus, '🌙');
      assert.equal(refused.status, 429);
      assert.ok(Number(refused.headers.get('retry-after')) > 0);
      assert.equal((await put(hera, '🌙')).status, 200);
    },
  }));

test('a mention written with the sign after the name still finds the person', () =>
  within({
    async run({ zeus, hera }) {
      await zeus('/api/me/sign', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sign: '🦁' }) });
      const posted = await say(hera, 'general', { text: 'salut @Zeus🦁, ai un minut?' });
      assert.deepEqual((await posted.json()).turn.mentions, ['human:zeus']);
    },
  }));

test('what one person posts reaches another person live', () =>
  within({
    async run({ zeus, hera }) {
      const abort = new AbortController();
      const stream = new Collector(await hera('/api/stream', { signal: abort.signal }));
      await stream.waitFor((t) => t.includes('event: hello'));

      await say(zeus, 'olympus', { text: '@hera uite pasul cu Styx' });
      await stream.waitFor((t) => t.includes('"text":"@hera uite pasul cu Styx"'));
      assert.match(stream.text, /event: message\nid: 1\ndata: /);
      abort.abort();
    },
  }));

test('a person can have only so many streams open, and a closed one makes room', () =>
  within({
    options: { maxStreamsPerParticipant: 2 },
    async run({ zeus, hera }) {
      const aborts = [new AbortController(), new AbortController()];
      for (const abort of aborts) assert.equal((await zeus('/api/stream', { signal: abort.signal })).status, 200);

      const third = await zeus('/api/stream');
      assert.equal(third.status, 429);
      assert.match((await third.json()).error, /too many open streams/);
      assert.equal((await hera('/api/stream', { signal: aborts[0].signal })).status, 200); // somebody else is not affected

      aborts[1].abort();
      let status = 429;
      for (let i = 0; i < 50 && status !== 200; i += 1) {
        await sleep(10);
        const again = new AbortController();
        status = (await zeus('/api/stream', { signal: again.signal })).status;
        again.abort();
      }
      assert.equal(status, 200);
      aborts[0].abort();
    },
  }));

test('what goes wrong inside is a 500 that says nothing about the inside', async () => {
  const log = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    await within({
      options: {
        hub: (hub) =>
          Object.assign(Object.create(hub), {
            publish() {
              throw new Error('secret detail at /etc/passwd');
            },
          }),
      },
      async run({ zeus }) {
        const res = await say(zeus, 'general', { text: 'salut' });
        assert.equal(res.status, 500);
        assert.deepEqual(await res.json(), { error: 'internal error' });
      },
    });
  } finally {
    console.error = log;
  }
  assert.equal(logged.length, 1); // it is in the log, not in the answer
});

test('a room started from a config keeps its history across a restart, and will not start twice on one port', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'room-run-'));
  try {
    const config = parseConfig({ ...configFor(), participants: configFor().participants, port: 0, dbPath: 'data/room.db' }, dir);
    const call = (room, token, path, init = {}) =>
      fetch(`http://127.0.0.1:${room.port}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });

    const first = await startRoom(config);
    assert.equal((await say((p, i) => call(first, TOKENS.zeus, p, i), 'general', { text: 'înainte de oprire' })).status, 201);

    // a second room on the same port fails cleanly
    await assert.rejects(startRoom({ ...config, port: first.port, dbPath: join(dir, 'other.db') }), /EADDRINUSE/);
    await first.close();

    const second = await startRoom(config);
    const { turns } = await (await call(second, TOKENS.hera, '/api/rooms/general/messages')).json();
    assert.deepEqual(turns.map((t) => [t.seq, t.speakerId, t.text]), [[1, 'human:zeus', 'înainte de oprire']]);
    assert.equal((await (await say((p, i) => call(second, TOKENS.hera, p, i), 'general', { text: 'după' })).json()).turn.seq, 2);
    await second.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('too many wrong keys from one caller: turned away, the right key too, other callers untouched, and it passes', async () => {
  let now = 7_000_000;
  const config = configFor();
  const store = new RoomStore(nodeSqlite(':memory:'));
  store.syncParticipants(config.participants.map(({ kind, alias }) => ({ kind, alias })));
  store.syncConversations(config.rooms);
  const hub = new Hub(store, { graceMs: 25 });
  // the handler as a home calls it: the home says who is calling
  const app = createApp(store, hub, { version: VERSION, authenticate: createAuthenticator(config), callerFromHome: true, authFailures: { attempts: 3, windowMs: 60_000 }, now: () => now });
  const from = (ip, token) => app(new Request('http://portal.test/api/me', { headers: { [CALLER_HEADER]: ip, Authorization: `Bearer ${token}` } }));
  try {
    for (let i = 0; i < 3; i += 1) assert.equal((await from('1.1.1.1', `wrong${i}`)).status, 401);

    const refused = await from('1.1.1.1', TOKENS.zeus);
    assert.equal(refused.status, 429);
    assert.equal(refused.headers.get('retry-after'), '60');
    assert.match((await refused.json()).error, /wrong keys/);

    assert.equal((await from('2.2.2.2', TOKENS.zeus)).status, 200);

    // a handler whose home did not say so counts everyone as one, whatever the header holds
    const unsaid = createApp(store, hub, { version: VERSION, authenticate: createAuthenticator(config), authFailures: { attempts: 3, windowMs: 60_000 }, now: () => now });
    for (let i = 0; i < 3; i += 1) await unsaid(new Request('http://portal.test/api/me', { headers: { [CALLER_HEADER]: `x${i}`, Authorization: 'Bearer bad' } }));
    assert.equal((await unsaid(new Request('http://portal.test/api/me', { headers: { [CALLER_HEADER]: 'fresh', Authorization: `Bearer ${TOKENS.zeus}` } }))).status, 429);

    now += 60_001;
    assert.equal((await from('1.1.1.1', TOKENS.zeus)).status, 200);
  } finally {
    hub.close();
  }
});

test('the limiter lets go of callers who have nothing left in the window', async () => {
  const { SlidingWindowLimiter } = await import('../dist/limiter.js');
  let now = 1_000;
  const limiter = new SlidingWindowLimiter(3, 1_000, () => now);
  for (let i = 0; i < 2000; i += 1) limiter.take(`caller${i}`);
  now += 1_001;
  limiter.take('late');
  assert.ok(limiter.hits.size < 10, `kept ${limiter.hits.size}`);
});

test('on Node, the caller is the socket, a header the client sends cannot make a new one, and a proxy header is used only when named', async () => {
  const config = configFor();
  const open = (listenerOptions) => {
    const store = new RoomStore(nodeSqlite(':memory:'));
    store.syncParticipants(config.participants.map(({ kind, alias }) => ({ kind, alias })));
    store.syncConversations(config.rooms);
    const hub = new Hub(store, { graceMs: 25 });
    const server = createServer(toNodeListener(createApp(store, hub, { version: VERSION, authenticate: createAuthenticator(config), callerFromHome: true, authFailures: { attempts: 3, windowMs: 60_000 } }), listenerOptions));
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, hub, base: `http://127.0.0.1:${server.address().port}` })));
  };
  const from = (base, headers, token) => fetch(`${base}/api/me`, { headers: { ...headers, Authorization: `Bearer ${token}` } }).then((r) => r.status);

  // no proxy named: the socket is the caller, whatever headers say
  const direct = await open();
  for (let i = 0; i < 3; i += 1) assert.equal(await from(direct.base, { [CALLER_HEADER]: `fake${i}`, 'x-forwarded-for': `9.9.9.${i}` }, `wrong${i}`), 401);
  assert.equal(await from(direct.base, { [CALLER_HEADER]: 'fresh', 'x-forwarded-for': '8.8.8.8' }, TOKENS.zeus), 429);
  direct.hub.close();
  direct.server.closeAllConnections();
  await new Promise((r) => direct.server.close(r));

  // behind a proxy that says so: its header, the last entry, and one caller's wrong keys do not close the door on another
  const proxied = await open({ clientIpHeader: 'X-Forwarded-For' });
  for (let i = 0; i < 3; i += 1) assert.equal(await from(proxied.base, { 'x-forwarded-for': `6.6.6.6, 1.1.1.1` }, `wrong${i}`), 401);
  assert.equal(await from(proxied.base, { 'x-forwarded-for': '7.7.7.7, 1.1.1.1' }, TOKENS.zeus), 429); // same last entry: same caller
  assert.equal(await from(proxied.base, { 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }, TOKENS.zeus), 200);
  proxied.hub.close();
  proxied.server.closeAllConnections();
  await new Promise((r) => proxied.server.close(r));
});
