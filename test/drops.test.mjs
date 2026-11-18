import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test, test as nodeTest } from 'node:test';
import { ConfigError, FREQ_PATTERN, RoomError, RoomStore, nodeSqlite, objectSqlite, parseConfig, parseFade } from '../dist/index.js';
import { objectStandIn } from './object-stand-in.mjs';

// RFC 002 (drop), the first step: the `drops` block of the config, and the table the drops live in. No route yet.

const TOKEN_A = 'a'.repeat(24);
const TOKEN_B = 'b'.repeat(24);

const valid = (drops) => ({
  participants: [
    { kind: 'human', alias: 'Zeus', token: TOKEN_A },
    { kind: 'human', alias: 'Hera', token: TOKEN_B },
    { kind: 'companion', alias: 'Nova' },
  ],
  rooms: [{ id: 'general', title: 'General' }],
  ...(drops === undefined ? {} : { drops }),
});

const refuses = (raw, pattern) =>
  assert.throws(
    () => parseConfig(raw, '/base'),
    (err) => {
      assert.ok(err instanceof ConfigError, String(err));
      assert.match(err.message, pattern);
      assert.equal(err.message.includes(TOKEN_A) || err.message.includes(TOKEN_B), false);
      return true;
    },
  );

const one = { frequencies: [{ freq: '99.6', holder: 'Zeus' }] };

// --- the frequency and the fade, as words ---

test('a frequency is one to three digits, a dot and one digit', () => {
  for (const ok of ['0.1', '36.9', '99.6', '999.9']) assert.ok(FREQ_PATTERN.test(ok), ok);
  for (const bad of ['', '99', '99.', '.5', '99.66', '1000.0', '9 9.6', '-1.0', '99,6', '99.6\n']) assert.equal(FREQ_PATTERN.test(bad), false, JSON.stringify(bad));
});

test('a fade is a whole number and m, h or d, in milliseconds', () => {
  assert.equal(parseFade('45m'), 45 * 60_000);
  assert.equal(parseFade('24h'), 24 * 3_600_000);
  assert.equal(parseFade('7d'), 7 * 86_400_000);
  for (const bad of ['', '7', '0d', '7w', '1.5d', 'd', ' 7d', '7d ', '-1d', 7, undefined, null]) assert.equal(parseFade(bad), undefined, JSON.stringify(bad));
});

// --- the config ---

test('a config with no drops block has no drops', () => {
  assert.equal(parseConfig(valid(), '/base').drops, undefined);
});

test('a drops block gets its defaults: the numbers agreed in RFC 002', () => {
  const { drops } = parseConfig(valid(one), '/base');
  assert.deepEqual(drops.frequencies, [{ freq: '99.6', title: '99.6', holder: 'Zeus' }]); // a title is the frequency unless said
  assert.deepEqual(drops.allowOrigins, []); // empty: no CORS at all
  assert.equal(drops.maxBytes, 8192);
  assert.deepEqual(drops.perAddress, { perMinute: 15, burst: 3 });
  assert.deepEqual(drops.perFrequency, { perMinute: 60 });
  assert.equal(drops.capacity, 50);
  assert.deepEqual(drops.fade, { defaultMs: 7 * 86_400_000, maxMs: 30 * 86_400_000 });
});

test('a drops block says what it wants, and the holder is named as the participants are', () => {
  const { drops } = parseConfig(
    valid({
      frequencies: [
        { freq: '99.6', title: '🎁 CTT', holder: 'zeus' },
        { freq: '36.9', holder: 'HERA' },
      ],
      allowOrigins: ['https://amigo.sh', 'http://localhost:3000'],
      maxBytes: 4096,
      perAddress: { perMinute: 10, burst: 2 },
      perFrequency: { perMinute: 30 },
      capacity: 20,
      fade: { default: '24h', max: '14d' },
    }),
    '/base',
  );
  assert.deepEqual(drops.frequencies, [
    { freq: '99.6', title: '🎁 CTT', holder: 'Zeus' }, // the alias as the config spells it for the person, not as it was typed
    { freq: '36.9', title: '36.9', holder: 'Hera' },
  ]);
  assert.deepEqual(drops.allowOrigins, ['https://amigo.sh', 'http://localhost:3000']);
  assert.equal(drops.maxBytes, 4096);
  assert.deepEqual(drops.perAddress, { perMinute: 10, burst: 2 });
  assert.deepEqual(drops.perFrequency, { perMinute: 30 });
  assert.equal(drops.capacity, 20);
  assert.deepEqual(drops.fade, { defaultMs: 86_400_000, maxMs: 14 * 86_400_000 });
});

test('a drops block that is not a block, or holds no frequency, is refused', () => {
  refuses(valid([]), /drops must be an object/);
  refuses(valid('99.6'), /drops must be an object/);
  refuses(valid({}), /drops\.frequencies must be a list of at least one/);
  refuses(valid({ frequencies: [] }), /drops\.frequencies must be a list of at least one/);
  refuses(valid({ frequencies: 'x' }), /drops\.frequencies must be a list of at least one/);
});

test('a frequency must be written as one, held by a person, once each way', () => {
  for (const freq of ['99', '99.66', '1000.0', '', 99.6, undefined]) refuses(valid({ frequencies: [{ freq, holder: 'Zeus' }] }), /drops\.frequencies\[0\]\.freq/);
  refuses(valid({ frequencies: [{ freq: '99.6' }] }), /drops\.frequencies\[0\]\.holder/);
  refuses(valid({ frequencies: [{ freq: '99.6', holder: 'Nova' }] }), /drops\.frequencies\[0\]: "Nova" must be a human/); // a companion holds nothing
  refuses(valid({ frequencies: [{ freq: '99.6', holder: 'Ares' }] }), /drops\.frequencies\[0\]: "Ares" is not a participant/);
  refuses(valid({ frequencies: [{ freq: '99.6', holder: 'Zeus' }, { freq: '99.6', holder: 'Hera' }] }), /the frequency "99\.6" is used twice/);
  refuses(valid({ frequencies: [{ freq: '99.6', holder: 'Zeus' }, { freq: '36.9', holder: 'zeus' }] }), /"Zeus" holds two frequencies/); // one each way, in v1
  refuses(valid({ frequencies: [{ freq: '99.6', holder: 'Zeus', title: '' }] }), /drops\.frequencies\[0\]\.title/);
  refuses(valid({ frequencies: [{ freq: '99.6', holder: 'Zeus', title: 'x'.repeat(41) }] }), /drops\.frequencies\[0\]\.title/);
  refuses(valid({ frequencies: [{ freq: '99.6', holder: 'Zeus', title: 'a<b' }] }), /drops\.frequencies\[0\]\.title/);
});

test('allowOrigins are exact origins: no wildcard, no path, no other scheme', () => {
  for (const bad of ['*', 'https://*.amigo.sh', 'amigo.sh', 'https://amigo.sh/', 'https://amigo.sh/x', 'ftp://amigo.sh', 'https://amigo.sh?x=1', '']) {
    refuses(valid({ ...one, allowOrigins: [bad] }), /drops\.allowOrigins\[0\]/);
  }
  refuses(valid({ ...one, allowOrigins: 'https://amigo.sh' }), /drops\.allowOrigins must be a list/);
  refuses(valid({ ...one, allowOrigins: ['https://amigo.sh', 'https://amigo.sh'] }), /drops\.allowOrigins: "https:\/\/amigo\.sh" is there twice/);
});

test('the numbers of a drops block are kept inside their bounds', () => {
  refuses(valid({ ...one, maxBytes: 0 }), /drops\.maxBytes/);
  refuses(valid({ ...one, maxBytes: 32769 }), /drops\.maxBytes/); // never past the size of a message
  refuses(valid({ ...one, maxBytes: 'big' }), /drops\.maxBytes/);
  refuses(valid({ ...one, capacity: 0 }), /drops\.capacity/);
  refuses(valid({ ...one, capacity: 1001 }), /drops\.capacity/);
  refuses(valid({ ...one, perAddress: { perMinute: 0 } }), /drops\.perAddress\.perMinute/);
  refuses(valid({ ...one, perAddress: { burst: 0 } }), /drops\.perAddress\.burst/);
  refuses(valid({ ...one, perAddress: 3 }), /drops\.perAddress must be an object/);
  refuses(valid({ ...one, perFrequency: { perMinute: 0 } }), /drops\.perFrequency\.perMinute/);
  refuses(valid({ ...one, perFrequency: 3 }), /drops\.perFrequency must be an object/);
});

test('a fade in the config is a fade as words, and the default may not be longer than the longest', () => {
  refuses(valid({ ...one, fade: { default: '7' } }), /drops\.fade\.default/);
  refuses(valid({ ...one, fade: { max: '1w' } }), /drops\.fade\.max/);
  refuses(valid({ ...one, fade: { default: '31d' } }), /drops\.fade\.default must not be longer than drops\.fade\.max/);
  refuses(valid({ ...one, fade: { default: '1d', max: '12h' } }), /drops\.fade\.default must not be longer than drops\.fade\.max/);
  refuses(valid({ ...one, fade: 7 }), /drops\.fade must be an object/);
  refuses(valid({ ...one, fade: { max: '365d' } }), /drops\.fade\.max/); // a drop that does not fade soon is not a drop
});

// --- the store, in each of its homes ---

const HOMES = {
  'a file (in memory)': () => ({ open: () => nodeSqlite(':memory:'), done: () => {} }),
  'a Durable Object (stand-in)': () => {
    const db = new DatabaseSync(':memory:');
    return { open: () => objectSqlite(objectStandIn(db)), done: () => db.close() };
  },
};

function clock(start = Date.UTC(2026, 10, 18, 9, 0, 0)) {
  let t = start;
  const now = () => new Date(t);
  now.advance = (ms) => (t += ms);
  now.at = () => t;
  return now;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

for (const [where, make] of Object.entries(HOMES)) {
  const test = (name, body) =>
    nodeTest(`${name} (${where})`, () => {
      const home = make();
      try {
        body(home);
      } finally {
        home.done();
      }
    });

  const open = (home) => {
    const now = clock();
    const store = new RoomStore(home.open(), { now });
    store.syncParticipants([{ kind: 'human', alias: 'Zeus' }]);
    store.syncConversations([{ id: 'general', title: 'General' }]);
    return { store, now };
  };
  const refuses = (work) => assert.throws(work, (err) => err instanceof RoomError && err.code === 'invalid');

  test('a drop is kept on its frequency, with no one it came from, and read back newest first', (home) => {
    const { store, now } = open(home);
    const first = store.addDrop({ freq: '99.6', body: 'one', fadeMs: DAY }, 50);
    now.advance(1000);
    const second = store.addDrop({ freq: '99.6', body: 'two', format: 'note', fadeMs: DAY }, 50);

    assert.equal(first.drop.format, 'note'); // note unless said
    assert.equal(first.evicted, 0);
    const read = store.listDrops('99.6');
    assert.deepEqual(read.map((d) => d.body), ['two', 'one']);
    assert.deepEqual(Object.keys(read[0]).sort(), ['body', 'createdAt', 'fadesAt', 'format', 'freq', 'id']); // and nothing of who wrote it
    assert.equal(read[0].id, second.drop.id);
    assert.equal(read[0].createdAt, now.at());
    assert.equal(read[0].fadesAt, now.at() + DAY);
    assert.deepEqual(store.listDrops('36.9'), []); // another frequency holds none of them
  });

  test('a drop that is not well made is refused: the store holds what the route has already checked, and no more', (home) => {
    const { store } = open(home);
    for (const freq of ['99', '99.66', '', undefined]) refuses(() => store.addDrop({ freq, body: 'x', fadeMs: DAY }, 50));
    for (const body of ['', undefined, 7]) refuses(() => store.addDrop({ freq: '99.6', body, fadeMs: DAY }, 50));
    for (const fadeMs of [0, -1, 1.5, NaN, undefined]) refuses(() => store.addDrop({ freq: '99.6', body: 'x', fadeMs }, 50));
    for (const format of ['', 'x'.repeat(41), 7]) refuses(() => store.addDrop({ freq: '99.6', body: 'x', format, fadeMs: DAY }, 50));
    for (const capacity of [0, -1, 1.5, undefined]) refuses(() => store.addDrop({ freq: '99.6', body: 'x', fadeMs: DAY }, capacity));
    assert.deepEqual(store.listDrops('99.6'), []);
  });

  test('a drop is gone from the very second its fade is reached, and a read lets it go', (home) => {
    const { store, now } = open(home);
    store.addDrop({ freq: '99.6', body: 'brief', fadeMs: 1000 }, 50);
    now.advance(999);
    assert.equal(store.listDrops('99.6').length, 1); // one millisecond less: alive
    now.advance(1);
    assert.deepEqual(store.listDrops('99.6'), []); // the boundary itself is gone
    assert.equal(store.countDrops('99.6'), 0); // and not only hidden: the read has let it go
    assert.equal(store.nextDropFade(), null);
  });

  test('a room that is full lets the oldest go, and the new one stays', (home) => {
    const { store, now } = open(home);
    const added = [];
    for (const body of ['a', 'b', 'c', 'd']) {
      now.advance(1000);
      added.push(store.addDrop({ freq: '99.6', body, fadeMs: DAY }, 3));
    }
    assert.deepEqual(added.map((r) => r.evicted), [0, 0, 0, 1]);
    assert.deepEqual(store.listDrops('99.6').map((d) => d.body), ['d', 'c', 'b']);
    assert.equal(store.countDrops('99.6'), 3);
  });

  test('the ceiling is for each frequency, and counts only what is alive', (home) => {
    const { store, now } = open(home);
    store.addDrop({ freq: '99.6', body: 'brief', fadeMs: HOUR }, 2);
    store.addDrop({ freq: '99.6', body: 'long', fadeMs: DAY }, 2);
    store.addDrop({ freq: '36.9', body: 'elsewhere', fadeMs: DAY }, 2);
    now.advance(2 * HOUR); // the brief one has faded
    const added = store.addDrop({ freq: '99.6', body: 'new', fadeMs: DAY }, 2);
    assert.equal(added.evicted, 0); // the faded one made room: nobody alive was pushed out
    assert.deepEqual(store.listDrops('99.6').map((d) => d.body), ['new', 'long']);
    assert.deepEqual(store.listDrops('36.9').map((d) => d.body), ['elsewhere']);
  });

  test('purging lets go of what has faded on every frequency, and says how many', (home) => {
    const { store, now } = open(home);
    store.addDrop({ freq: '99.6', body: 'a', fadeMs: HOUR }, 50);
    store.addDrop({ freq: '36.9', body: 'b', fadeMs: HOUR }, 50);
    store.addDrop({ freq: '36.9', body: 'c', fadeMs: DAY }, 50);
    assert.equal(store.purgeDrops(), 0); // nothing has faded yet, and nothing is touched
    now.advance(2 * HOUR);
    assert.equal(store.purgeDrops(), 2);
    assert.equal(store.purgeDrops(), 0); // again: nothing left to do
    assert.deepEqual(store.listDrops('36.9').map((d) => d.body), ['c']);
  });

  test('purging has the same boundary as reading: the second a fade is reached, the drop goes', (home) => {
    const { store, now } = open(home);
    store.addDrop({ freq: '99.6', body: 'a', fadeMs: HOUR }, 50);
    now.advance(HOUR - 1);
    assert.equal(store.purgeDrops(), 0);
    now.advance(1);
    assert.equal(store.purgeDrops(), 1);
  });

  test('what was left lately is told by frequency and time, and nothing of who left it', (home) => {
    const { store, now } = open(home);
    store.addDrop({ freq: '99.6', body: 'old', fadeMs: DAY }, 50);
    now.advance(70_000);
    store.addDrop({ freq: '99.6', body: 'a', fadeMs: DAY }, 50);
    store.addDrop({ freq: '36.9', body: 'b', fadeMs: DAY }, 50);
    const since = now.at() - 60_000;
    assert.deepEqual(store.droppedSince(since), [
      { freq: '99.6', createdAt: now.at() },
      { freq: '36.9', createdAt: now.at() },
    ]); // the one before the minute is not in it
    assert.deepEqual(store.droppedSince(now.at()), []); // and the boundary is after, as the limiter's window is
  });

  test('the next fade is the nearest one, for the alarm to be set at', (home) => {
    const { store, now } = open(home);
    assert.equal(store.nextDropFade(), null);
    store.addDrop({ freq: '99.6', body: 'later', fadeMs: DAY }, 50);
    store.addDrop({ freq: '36.9', body: 'sooner', fadeMs: HOUR }, 50);
    assert.equal(store.nextDropFade(), now.at() + HOUR);
  });

  test('what a portal keeps of what was said does not keep a drop, and does not let one go', (home) => {
    const { store, now } = open(home);
    store.addDrop({ freq: '99.6', body: 'long', fadeMs: 30 * DAY }, 50);
    now.advance(20 * DAY); // past what a chat is kept for
    assert.deepEqual(store.forget({ days: 14, messages: 50 }), { turns: 0, gaps: 0 });
    assert.deepEqual(store.listDrops('99.6').map((d) => d.body), ['long']); // it lives for its own fade, and no longer
    now.advance(10 * DAY);
    assert.deepEqual(store.listDrops('99.6'), []);
  });

  test('a drop is not a turn: it takes no place in the order of what is said, and no stream cursor moves', (home) => {
    const { store } = open(home);
    const before = store.lastSeq();
    store.addDrop({ freq: '99.6', body: 'x', fadeMs: DAY }, 50);
    assert.equal(store.lastSeq(), before);
    assert.deepEqual(store.listTurns('general'), []);
  });
}
