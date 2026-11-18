import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CALLER_HEADER, Hub, RoomStore, TokenBucket, VERSION, createApp, createAuthenticator, nodeSqlite, parseConfig } from '../dist/index.js';

// RFC 002 (drop), step 2: the door that is open (POST /api/drops/ingest), its limits, and its CORS answer. The handler is called
// with Requests, as the homes call it, so a caller can be any address and the clock is the test's.

const DAY = 86_400_000;
const START = Date.UTC(2026, 10, 18, 9, 0, 0);
const AMIGO = 'https://amigo.sh';

// --- the bucket that lets a few through at once and the rest at a pace ---

test('a token bucket lets `capacity` through at once, then one every 60000 / perMinute ms', () => {
  let t = START;
  const bucket = new TokenBucket(3, 15, () => t); // 15 a minute: one every 4 s, up to 3 saved
  assert.deepEqual([bucket.take('a'), bucket.take('a'), bucket.take('a')], [0, 0, 0]);
  assert.equal(bucket.take('a'), 4000); // told how long until it may
  t += 1000;
  assert.equal(bucket.take('a'), 3000); // a refused try takes nothing and gives nothing
  t += 3000;
  assert.equal(bucket.take('a'), 0);
  assert.equal(bucket.take('a'), 4000);
});

test('a token bucket never holds more than its capacity, and keeps each key apart', () => {
  let t = START;
  const bucket = new TokenBucket(3, 15, () => t);
  bucket.take('a');
  t += 60 * 60_000; // an hour of quiet saves no more than three
  assert.deepEqual([bucket.take('a'), bucket.take('a'), bucket.take('a')], [0, 0, 0]);
  assert.ok(bucket.take('a') > 0);
  assert.equal(bucket.take('b'), 0); // another key has its own
});

test('a token bucket is made of numbers that make sense', () => {
  for (const [capacity, perMinute] of [[0, 15], [3, 0], [-1, 15], [3, -1], [1.5, 15], [3, NaN]]) assert.throws(() => new TokenBucket(capacity, perMinute), /TokenBucket/);
});

test('a token bucket lets go of the keys that are full again, so callers who never return do not pile up', () => {
  let t = START;
  const bucket = new TokenBucket(2, 60, () => t);
  for (let i = 0; i < 2000; i += 1) bucket.take(`caller-${i}`);
  t += 5 * 60_000;
  bucket.take('late'); // past the sweep point, everything that is full again is let go
  assert.ok(bucket.size < 10, `still holds ${bucket.size} keys`);
});

// --- the room ---

function open({ drops = {}, withDrops = true, callerFromHome = true } = {}) {
  const clock = { t: START };
  const now = () => clock.t;
  const config = parseConfig(
    {
      participants: [
        { kind: 'human', alias: 'Zeus', token: 'z'.repeat(24) },
        { kind: 'human', alias: 'Hera', token: 'h'.repeat(24) },
      ],
      rooms: [{ id: 'general', title: 'General' }],
      dbPath: ':memory:',
      ...(withDrops
        ? {
            drops: {
              frequencies: [
                { freq: '99.6', holder: 'Zeus' },
                { freq: '36.9', holder: 'Hera' },
              ],
              allowOrigins: [AMIGO],
              ...drops,
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
  const app = () => createApp(store, hub, { version: VERSION, authenticate: createAuthenticator(config), drops: config.drops, callerFromHome, now });
  let handle = app();
  const send = (method, body, { caller = '203.0.113.1', origin, headers = {}, path = '/api/drops/ingest' } = {}) =>
    handle(
      new Request(`http://portal.test${path}`, {
        method,
        headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), [CALLER_HEADER]: caller, ...(origin ? { origin } : {}), ...headers },
        body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
      }),
    );
  return {
    clock,
    store,
    config,
    post: (body, options) => send('POST', body, options),
    options: (options) => send('OPTIONS', undefined, options),
    get: (path, options) => send('GET', undefined, { ...options, path }),
    /** A restart: the same database, a handler that has begun again. */
    restart: () => {
      handle = app();
    },
    close: () => hub.close(),
  };
}

const drop = (to, text, more = {}) => ({ to, payload: { body: text, ...(more.payload ?? {}) }, ...Object.fromEntries(Object.entries(more).filter(([k]) => k !== 'payload')) });

async function within(work, options) {
  const room = open(options);
  try {
    await work(room);
  } finally {
    room.close();
  }
}

const emptyAnswer = async (res, status = 204) => {
  assert.equal(res.status, status);
  assert.equal(await res.text(), '');
};

// --- the door ---

test('a drop on a held frequency is taken with no key, answered 204 with nothing in it, and kept for its fade', () =>
  within(async ({ post, store, clock }) => {
    const res = await post(drop('99.6', 'Coffee tonight? - 36.9'));
    await emptyAnswer(res);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    const [kept] = store.listDrops('99.6');
    assert.equal(kept.body, 'Coffee tonight? - 36.9');
    assert.equal(kept.format, 'note'); // note unless the payload says
    assert.equal(kept.fadesAt - kept.createdAt, 7 * DAY); // seven days unless the packet says
    assert.equal(kept.createdAt, clock.t);
    assert.equal('from' in kept, false); // and no one it came from, whatever the packet claimed
  }));

test('what the packet says of its payload and its fade is kept, a `from` it claims is not', () =>
  within(async ({ post, store }) => {
    await emptyAnswer(await post({ to: '36.9', fade: '45m', from: '99.6', payload: { body: 'x', format: 'patch' } }));
    const [kept] = store.listDrops('36.9');
    assert.equal(kept.format, 'patch');
    assert.equal(kept.fadesAt - kept.createdAt, 45 * 60_000);
    assert.deepEqual(Object.keys(kept).sort(), ['body', 'createdAt', 'fadesAt', 'format', 'freq', 'id']);
  }));

test('a fade longer than the longest is cut to it; one that is not a fade is refused', () =>
  within(async ({ post, store }) => {
    await emptyAnswer(await post(drop('99.6', 'long', { fade: '365d' })));
    const [kept] = store.listDrops('99.6');
    assert.equal(kept.fadesAt - kept.createdAt, 30 * DAY);
    for (const [i, fade] of ['7w', '', 7, 'd', '1.5d', ' 7d', null].entries()) assert.equal((await post(drop('36.9', 'x', { fade }), { caller: `198.51.100.${i}` })).status, 400, JSON.stringify(fade));
    assert.equal(store.countDrops('36.9'), 0);
  }));

test('a frequency that nobody holds takes nothing, and the answer is the same as for one that is held', () =>
  within(async ({ post, store }) => {
    const held = await post(drop('99.6', 'x'), { caller: '198.51.100.1' });
    const unheld = await post(drop('12.3', 'x'), { caller: '198.51.100.2' });
    await emptyAnswer(held);
    await emptyAnswer(unheld);
    assert.deepEqual([...unheld.headers].sort(), [...held.headers].sort()); // nothing in the answer says which is which
    assert.equal(store.countDrops('12.3'), 0);
    assert.equal(store.countDrops('99.6'), 1);
  }));

test('a portal with no drops block has no such door', () =>
  within(
    async ({ post, options }) => {
      assert.equal((await post(drop('99.6', 'x'))).status, 404);
      assert.equal((await options({ origin: AMIGO })).status, 404);
    },
    { withDrops: false },
  ));

test('only POST and OPTIONS are answered on it', () =>
  within(async ({ get }) => {
    const res = await get('/api/drops/ingest');
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST, OPTIONS');
  }));

test('what is not a drop is refused and nothing is kept', () =>
  within(async ({ post, store }) => {
    const bad = [
      ['not json', 'nope', 400],
      ['not an object', '[1]', 400],
      ['no frequency', { payload: { body: 'x' } }, 400],
      ['a frequency that is not one', { to: '99', payload: { body: 'x' } }, 400],
      ['a number for a frequency', { to: 99.6, payload: { body: 'x' } }, 400],
      ['no payload', { to: '99.6' }, 400],
      ['a payload that is a string', { to: '99.6', payload: 'x' }, 400],
      ['no body', { to: '99.6', payload: {} }, 400],
      ['an empty body', { to: '99.6', payload: { body: '' } }, 400],
      ['a body that is not text', { to: '99.6', payload: { body: 7 } }, 400],
      ['an empty format', { to: '99.6', payload: { body: 'x', format: '' } }, 400],
      ['a format that is not text', { to: '99.6', payload: { body: 'x', format: 7 } }, 400],
      ['a format that is too long', { to: '99.6', payload: { body: 'x', format: 'f'.repeat(41) } }, 400],
    ];
    for (const [i, [why, body, status]] of bad.entries()) assert.equal((await post(body, { caller: `192.0.2.${i}` })).status, status, why);
    assert.equal((await post(drop('99.6', 'x'), { headers: { 'content-type': 'text/plain' } })).status, 415);
    assert.equal((await post(drop('99.6', 'x'), { headers: { 'content-type': 'application/jsonx' } })).status, 415);
    assert.equal(store.countDrops('99.6'), 0);
  }));

test('a body is at most 8 KB of UTF-8, and a request is at most that and a margin for its envelope', () =>
  within(async ({ post, store }) => {
    await emptyAnswer(await post(drop('99.6', 'a'.repeat(8192)), { caller: '192.0.2.1' })); // exactly 8 KB
    assert.equal((await post(drop('99.6', 'a'.repeat(8193)), { caller: '192.0.2.2' })).status, 413);
    assert.equal((await post(drop('99.6', 'é'.repeat(4097)), { caller: '192.0.2.3' })).status, 413); // two bytes each: 8194 bytes, though only 4097 characters
    await emptyAnswer(await post(drop('99.6', 'é'.repeat(4096)), { caller: '192.0.2.4' })); // and 8192 bytes fit
    assert.equal((await post(drop('99.6', 'a'.repeat(8192 + 600)), { caller: '192.0.2.5' })).status, 413); // past the margin: refused before it is read as JSON
    const declared = await post(drop('99.6', 'x'), { caller: '192.0.2.6', headers: { 'content-length': String(8192 + 513) } });
    assert.equal(declared.status, 413);
    assert.equal(store.countDrops('99.6'), 2);
  }));

test('the size of a body is the config\'s', () =>
  within(
    async ({ post }) => {
      await emptyAnswer(await post(drop('99.6', 'a'.repeat(100)), { caller: '192.0.2.1' }));
      assert.equal((await post(drop('99.6', 'a'.repeat(101)), { caller: '192.0.2.2' })).status, 413);
    },
    { drops: { maxBytes: 100 } },
  ));

// --- the limits of an open door ---

test('one address may leave 3 at once on a frequency, then one every 4 seconds; 429 says how long', () =>
  within(async ({ post, clock }) => {
    for (let i = 0; i < 3; i += 1) await emptyAnswer(await post(drop('99.6', `n${i}`)));
    const refused = await post(drop('99.6', 'too many'));
    assert.equal(refused.status, 429);
    assert.equal(refused.headers.get('retry-after'), '4');
    assert.deepEqual(await refused.json(), { error: 'too many drops from here just now, wait a little' });
    clock.t += 4000;
    await emptyAnswer(await post(drop('99.6', 'again')));
    assert.equal((await post(drop('99.6', 'and again'))).status, 429);
  }));

test('the limit is for the address and the frequency together: another address, or another frequency, has its own', () =>
  within(async ({ post }) => {
    for (let i = 0; i < 3; i += 1) await emptyAnswer(await post(drop('99.6', `n${i}`), { caller: '192.0.2.1' }));
    assert.equal((await post(drop('99.6', 'x'), { caller: '192.0.2.1' })).status, 429);
    await emptyAnswer(await post(drop('99.6', 'x'), { caller: '192.0.2.2' }));
    await emptyAnswer(await post(drop('36.9', 'x'), { caller: '192.0.2.1' }));
  }));

test('a frequency nobody holds is limited the same way, so a 429 does not say which are held', () =>
  within(async ({ post }) => {
    for (let i = 0; i < 3; i += 1) await emptyAnswer(await post(drop('12.3', `n${i}`)));
    assert.equal((await post(drop('12.3', 'x'))).status, 429);
  }));

test('a frequency takes 60 a minute from anyone, held or not, and then 429', () =>
  within(async ({ post, clock, store }) => {
    for (let i = 0; i < 60; i += 1) await emptyAnswer(await post(drop('99.6', `n${i}`), { caller: `10.0.${i}.1` }));
    const refused = await post(drop('99.6', 'one more'), { caller: '10.1.0.1' });
    assert.equal(refused.status, 429);
    assert.ok(Number(refused.headers.get('retry-after')) >= 1);
    assert.equal(store.countDrops('99.6'), 50); // the room holds 50: the rest were let go, oldest first
    for (let i = 0; i < 60; i += 1) await emptyAnswer(await post(drop('12.3', `n${i}`), { caller: `10.2.${i}.1` }));
    assert.equal((await post(drop('12.3', 'x'), { caller: '10.3.0.1' })).status, 429); // unheld: the same
    clock.t += 61_000;
    await emptyAnswer(await post(drop('99.6', 'later'), { caller: '10.1.0.1' }));
  }));

test('the count for a frequency is picked up again by a handler that begins, from what was kept; the count for an address is not kept', () =>
  within(
    async ({ post, restart }) => {
      for (let i = 0; i < 60; i += 1) await emptyAnswer(await post(drop('99.6', `n${i}`), { caller: `10.0.${i}.1` }));
      restart();
      assert.equal((await post(drop('99.6', 'x'), { caller: '10.9.9.9' })).status, 429); // a restart gives no second full minute
      await emptyAnswer(await post(drop('36.9', 'y'), { caller: '10.9.9.9' })); // another frequency is untouched
      // an address is not remembered: nothing keeps one, so a caller who had used all its tokens has them again
      for (let i = 0; i < 3; i += 1) await emptyAnswer(await post(drop('36.9', `n${i}`), { caller: '10.8.8.8' }));
      restart();
      await emptyAnswer(await post(drop('36.9', 'z'), { caller: '10.8.8.8' }));
    },
    { drops: { capacity: 100 } },
  ));

test('what is refused for being badly made without a frequency does not count against anyone', () =>
  within(async ({ post }) => {
    for (let i = 0; i < 20; i += 1) assert.equal((await post({ payload: { body: 'x' } })).status, 400);
    for (let i = 0; i < 20; i += 1) assert.equal((await post('not json')).status, 400);
    await emptyAnswer(await post(drop('99.6', 'x'))); // the same address, with a frequency, still has all its tokens
  }));

test('a request with a frequency counts even if the rest is wrong, so a flood of bad ones is limited too', () =>
  within(async ({ post }) => {
    for (let i = 0; i < 3; i += 1) assert.equal((await post({ to: '99.6' })).status, 400);
    assert.equal((await post({ to: '99.6' })).status, 429);
  }));

test('the room holds as many as its capacity says, and lets the oldest go', () =>
  within(
    async ({ post, store, clock }) => {
      for (const text of ['a', 'b', 'c']) {
        clock.t += 5000;
        await emptyAnswer(await post(drop('99.6', text)));
      }
      assert.deepEqual(store.listDrops('99.6').map((d) => d.body), ['c', 'b']);
    },
    { drops: { capacity: 2 } },
  ));

test('the caller is what the home says, and without a home that says so every caller is one', () =>
  within(
    async ({ post }) => {
      for (let i = 0; i < 3; i += 1) await emptyAnswer(await post(drop('99.6', `n${i}`), { caller: `192.0.2.${i}` }));
      assert.equal((await post(drop('99.6', 'x'), { caller: '192.0.2.9' })).status, 429); // a header nobody vouched for is not believed
    },
    { callerFromHome: false },
  ));

// --- from a browser: CORS, for one route and for exact origins ---

const cors = (res) => Object.fromEntries([...res.headers].filter(([name]) => name.startsWith('access-control-')));

test('a preflight from an allowed origin is answered 204 with what a browser needs and no more', () =>
  within(async ({ options }) => {
    const res = await options({ origin: AMIGO, headers: { 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
    await emptyAnswer(res);
    assert.deepEqual(cors(res), {
      'access-control-allow-origin': AMIGO,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
      'access-control-max-age': '600',
    });
    assert.equal(res.headers.get('vary'), 'Origin');
    assert.equal(res.headers.get('access-control-allow-credentials'), null);
  }));

test('a preflight from any other origin, or from none, is a plain 403 with no CORS header at all', () =>
  within(async ({ options }) => {
    for (const origin of ['https://evil.example', 'https://amigo.sh.evil.example', 'http://amigo.sh', 'https://AMIGO.sh', 'https://amigo.sh/', 'null', undefined]) {
      const res = await options({ origin });
      assert.equal(res.status, 403, String(origin));
      assert.deepEqual(cors(res), {}, String(origin));
    }
  }));

test('a drop sent from an allowed origin carries the origin back, on the refusals too, so the page can read why', () =>
  within(async ({ post }) => {
    const ok = await post(drop('99.6', 'x'), { origin: AMIGO, caller: '192.0.2.1' });
    await emptyAnswer(ok);
    assert.equal(ok.headers.get('access-control-allow-origin'), AMIGO);
    assert.equal(ok.headers.get('vary'), 'Origin');
    const bad = await post({ to: '99' }, { origin: AMIGO, caller: '192.0.2.2' });
    assert.equal(bad.status, 400);
    assert.equal(bad.headers.get('access-control-allow-origin'), AMIGO);
    const big = await post(drop('99.6', 'a'.repeat(9000)), { origin: AMIGO, caller: '192.0.2.3' });
    assert.equal(big.status, 413);
    assert.equal(big.headers.get('access-control-allow-origin'), AMIGO);
    for (let i = 0; i < 3; i += 1) await post(drop('36.9', `n${i}`), { origin: AMIGO, caller: '192.0.2.4' });
    const slow = await post(drop('36.9', 'x'), { origin: AMIGO, caller: '192.0.2.4' });
    assert.equal(slow.status, 429);
    assert.equal(slow.headers.get('access-control-allow-origin'), AMIGO);
    assert.equal(slow.headers.get('access-control-expose-headers'), 'Retry-After'); // a page cannot read Retry-After without this
    assert.equal(slow.headers.get('access-control-allow-credentials'), null);
  }));

test('a drop that says it comes from an origin that is not allowed is refused, kept nowhere, and counted for no one', () =>
  within(async ({ post, store }) => {
    for (let i = 0; i < 10; i += 1) {
      const res = await post(drop('99.6', 'x'), { origin: 'https://evil.example' });
      assert.equal(res.status, 403);
      assert.deepEqual(cors(res), {});
    }
    assert.equal(store.countDrops('99.6'), 0);
    await emptyAnswer(await post(drop('99.6', 'x'))); // no Origin, as from curl: it goes through, and had all its tokens
  }));

test('with no origins allowed, which is what a config says unless it says more, a browser is refused and curl is not', () =>
  within(
    async ({ post, options }) => {
      assert.equal((await post(drop('99.6', 'x'), { origin: AMIGO })).status, 403);
      assert.equal((await options({ origin: AMIGO })).status, 403);
      await emptyAnswer(await post(drop('99.6', 'x'), { caller: '192.0.2.2' }));
    },
    { drops: { allowOrigins: [] } },
  ));

test('no other route of the API answers across origins', () =>
  within(async ({ get }) => {
    const res = await get('/api/health', { origin: AMIGO });
    assert.equal(res.status, 200);
    assert.deepEqual(cors(res), {});
  }));
