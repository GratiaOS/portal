import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test as nodeTest } from 'node:test';
import { MAX_TEXT_LENGTH, RoomError, RoomStore, nodeSqlite, objectSqlite } from '../dist/index.js';
import { objectStandIn } from './object-stand-in.mjs';

// The store's tests run in each of its homes, with the same bodies. A home gives a fresh database (`open()`, again for a
// restart), the same database by hand past the store (`raw`), and the schema version as that home keeps it.
const HOMES = {
  'a file': () => {
    const dir = mkdtempSync(join(tmpdir(), 'portal-'));
    const path = join(dir, 'portal.db');
    return {
      path,
      open: () => nodeSqlite(path),
      raw(work) {
        const db = new DatabaseSync(path);
        try {
          return work(db);
        } finally {
          db.close();
        }
      },
      version: (db) => db.prepare('PRAGMA user_version').get().user_version,
      setVersion: (db, version) => db.exec(`PRAGMA user_version = ${version}`),
      done: () => rmSync(dir, { recursive: true, force: true }),
    };
  },
  'a Durable Object (stand-in)': () => {
    const db = new DatabaseSync(':memory:');
    const storage = objectStandIn(db);
    return {
      open: () => objectSqlite(storage),
      raw: (work) => work(db),
      version: (db) => db.prepare("SELECT COALESCE((SELECT v FROM _portal_version WHERE id = 1), 0) AS v").get().v,
      setVersion: (db, version) =>
        db.exec(`CREATE TABLE IF NOT EXISTS _portal_version (id INTEGER PRIMARY KEY CHECK (id = 1), v INTEGER NOT NULL);
                 INSERT INTO _portal_version (id, v) VALUES (1, ${version}) ON CONFLICT(id) DO UPDATE SET v = excluded.v;`),
      done: () => db.close(),
    };
  },
};

const PEOPLE = [
  { kind: 'human', alias: 'Zeus', locale: 'ro' },
  { kind: 'human', alias: 'Hera' },
  { kind: 'companion', alias: 'Nova', capabilities: ['answer'] },
];
const CHANNELS = [
  { id: 'general', title: 'General' },
  { id: 'olympus', title: 'Olympus', tags: ['myths'] },
];

// A clock that moves one second per reading, so order and timestamps are predictable.
function ticking() {
  let t = Date.UTC(2026, 9, 29, 9, 0, 0);
  return () => new Date((t += 1000));
}

function room(home, options = {}) {
  const store = new RoomStore(home.open(), { now: ticking(), ...options });
  store.syncParticipants(PEOPLE);
  store.syncConversations(CHANNELS);
  return store;
}

const say = (store, conversationId, speakerId, text) => store.appendTurn({ conversationId, speakerId, text });
const refuses = (code, work) => assert.throws(work, (err) => err instanceof RoomError && err.code === code);

function dayClock(...days) {
  let i = -1;
  return () => new Date(`${days[Math.min(++i, days.length - 1)]}T13:37:00Z`);
}

function clock(start = Date.UTC(2026, 9, 1, 9, 0, 0)) {
  let t = start;
  const now = () => new Date(t);
  now.days = (n) => (t += n * 86_400_000);
  return now;
}

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

test('participants and conversations are synced from the config, and syncing again changes nothing', (home) => {
  const store = room(home);
  store.syncParticipants(PEOPLE);
  store.syncConversations(CHANNELS);

  assert.deepEqual(
    store.listParticipants().map((p) => p.id),
    ['human:hera', 'companion:nova', 'human:zeus'],
  );
  assert.deepEqual(store.getParticipant('human:zeus'), { id: 'human:zeus', kind: 'human', alias: 'Zeus', locale: 'ro', capabilities: [] });
  assert.deepEqual(store.getParticipant('companion:nova').capabilities, ['answer']);

  const [general, olympus] = store.listConversations();
  assert.equal(general.id, 'general');
  assert.equal(general.visibility, 'private'); // private unless said otherwise
  assert.equal(general.status, 'open');
  assert.deepEqual(olympus.tags, ['myths']);
});

test('syncing updates the title, not the status, and removes nobody', (home) => {
  const store = room(home);
  store.setConversationStatus('general', 'closed');
  store.syncConversations([{ id: 'general', title: 'Cafeneaua', visibility: 'public' }]);
  store.syncParticipants([{ kind: 'human', alias: 'Zeus' }]);

  const general = store.getConversation('general');
  assert.equal(general.title, 'Cafeneaua');
  assert.equal(general.visibility, 'public');
  assert.equal(general.status, 'closed');
  assert.equal(store.listParticipants().length, 3);
});

test('bad config is refused', (home) => {
  const store = room(home);
  refuses('invalid', () => store.syncParticipants([{ kind: 'robot', alias: 'x1' }]));
  refuses('invalid', () => store.syncParticipants([{ kind: 'human', alias: 'bad name' }]));
  refuses('invalid', () => store.syncParticipants([{ kind: 'human', alias: '-x' }]));
  refuses('invalid', () => store.syncParticipants([{ kind: 'companion', alias: 'zeus' }])); // an alias belongs to one participant
  refuses('invalid', () => store.syncConversations([{ id: 'Bad Id', title: 'x' }]));
  refuses('invalid', () => store.syncConversations([{ id: 'ok', title: 'x', visibility: 'secret' }]));
  // a refused batch leaves nothing behind
  refuses('invalid', () => store.syncConversations([{ id: 'half', title: 'x' }, { id: 'No', title: 'y' }]));
  assert.equal(store.getConversation('half'), undefined);
});

test('turns come back oldest first, with a global order across conversations', (home) => {
  const store = room(home);
  const a = say(store, 'general', 'human:zeus', 'Neața tuturor 🌱☀️');
  const b = say(store, 'olympus', 'human:hera', '@nova putem sari pasul cu Styx din Olympus?');
  const c = say(store, 'general', 'human:hera', 'Salut');

  assert.deepEqual([a.seq, b.seq, c.seq], [1, 2, 3]);
  assert.deepEqual(
    store.listTurns('general').map((t) => t.text),
    ['Neața tuturor 🌱☀️', 'Salut'],
  );
  assert.equal(a.createdAt, '2026-10-29T09:00:03.000Z'); // the clock was read for the two syncs first
  assert.equal(store.lastSeq(), 3);
});

test('a sign: the given one shows until a person chooses theirs; only the current one is kept, and a start does not undo it', (home) => {
  const store = room(home);
  store.syncParticipants([{ kind: 'human', alias: 'Zeus', sign: '🦁' }]);
  assert.equal(store.getParticipant('human:zeus').sign, '🦁'); // given
  assert.equal(store.getParticipant('human:hera').sign, undefined); // none given, none shown

  assert.equal(store.setSign('human:zeus', '🫁').sign, '🫁'); // chosen
  store.syncParticipants([{ kind: 'human', alias: 'Zeus', sign: '🦉' }]); // a restart with another given sign
  assert.equal(store.getParticipant('human:zeus').sign, '🫁'); // what he chose stays
  assert.equal(store.setSign('human:zeus', null).sign, '🦉'); // let go: the given one shows again
  assert.equal(store.setSign('human:hera', '🇷🇴').sign, '🇷🇴'); // a flag is one sign
  store.close();

  const again = new RoomStore(home.open());
  assert.equal(again.getParticipant('human:hera').sign, '🇷🇴');
  // nothing but the current sign is kept: no column of when, no column of what it was
  home.raw((db) => assert.deepEqual(db.prepare('PRAGMA table_info(participants)').all().map((c) => c.name).filter((n) => /sign/.test(n)), ['given_sign', 'sign']));
  again.close();
});

test('a sign that is not one emoji is refused, given or chosen', (home) => {
  const store = room(home);
  for (const bad of ['lion', '🦁🦁', '🦁 ', '1️⃣', '', 'a🦁']) refuses('invalid', () => store.setSign('human:zeus', bad));
  refuses('invalid', () => store.syncParticipants([{ kind: 'human', alias: 'Zeus', sign: 'zeu' }]));
  refuses('not_found', () => store.setSign('human:nimeni', '🦁'));
  // a sign is for the people in the room: not given to a companion, and not set on one
  refuses('invalid', () => store.syncParticipants([{ kind: 'companion', alias: 'Nova', sign: '✨' }]));
  refuses('not_found', () => store.setSign('companion:nova', '✨'));
  assert.equal(store.getParticipant('companion:nova').sign, undefined);
  for (const good of ['🦁', '🫁', '👩🏽‍💻', '❤️', '🏳️‍🌈']) assert.equal(store.setSign('human:zeus', good).sign, good);
});

test('a turn keeps who was mentioned', (home) => {
  const store = room(home);
  const turn = say(store, 'olympus', 'human:hera', '@nova putem sari pasul cu Styx? cc @Zeus, @nimeni');
  assert.deepEqual(turn.mentions, ['companion:nova', 'human:zeus']);
  assert.deepEqual(store.listTurns('olympus')[0].mentions, ['companion:nova', 'human:zeus']);
});

test('text is trimmed and normalized, and must be there and not too long', (home) => {
  const store = room(home);
  assert.equal(say(store, 'general', 'human:zeus', '  \n salut \n').text, 'salut');
  assert.equal(say(store, 'general', 'human:zeus', 'ș'.normalize('NFD')).text, 'ș'.normalize('NFC'));
  refuses('invalid', () => say(store, 'general', 'human:zeus', '   \n '));
  refuses('invalid', () => say(store, 'general', 'human:zeus', 'a'.repeat(MAX_TEXT_LENGTH + 1)));
  assert.equal(say(store, 'general', 'human:zeus', 'a'.repeat(MAX_TEXT_LENGTH)).text.length, MAX_TEXT_LENGTH);
});

test('unknown conversation, unknown speaker, closed conversation', (home) => {
  const store = room(home);
  refuses('not_found', () => say(store, 'nowhere', 'human:zeus', 'salut'));
  refuses('not_found', () => say(store, 'general', 'human:nimeni', 'salut'));
  refuses('not_found', () => store.listTurns('nowhere'));
  refuses('not_found', () => store.setConversationStatus('nowhere', 'closed'));

  store.setConversationStatus('general', 'closed');
  refuses('closed', () => say(store, 'general', 'human:zeus', 'salut'));
  assert.equal(store.listTurns('general').length, 0);
  store.setConversationStatus('general', 'open');
  assert.equal(say(store, 'general', 'human:zeus', 'salut').seq, 1);
});

test('history is read a page at a time, newest page first', (home) => {
  const store = room(home);
  for (let i = 1; i <= 7; i += 1) say(store, 'general', 'human:zeus', `m${i}`);
  say(store, 'olympus', 'human:zeus', 'elsewhere');

  const last = store.listTurns('general', { limit: 3 });
  assert.deepEqual(last.map((t) => t.text), ['m5', 'm6', 'm7']);
  const before = store.listTurns('general', { limit: 3, before: last[0].seq });
  assert.deepEqual(before.map((t) => t.text), ['m2', 'm3', 'm4']);
  const rest = store.listTurns('general', { limit: 3, before: before[0].seq });
  assert.deepEqual(rest.map((t) => t.text), ['m1']);
  assert.deepEqual(store.listTurns('general', { before: rest[0].seq }), []);

  // a silly limit is brought back to something sensible
  assert.equal(store.listTurns('general', { limit: 0 }).length, 1);
  assert.equal(store.listTurns('general', { limit: Number.NaN }).length, 7);
  assert.equal(store.listTurns('general', { limit: 10_000 }).length, 7);
});

test('a client that was away asks for everything after the last turn it saw', (home) => {
  const store = room(home);
  say(store, 'general', 'human:zeus', 'one');
  const seen = say(store, 'olympus', 'human:hera', 'two');
  say(store, 'general', 'human:zeus', 'three');
  say(store, 'olympus', 'human:hera', 'four');

  assert.deepEqual(store.turnsAfter(seen.seq).map((t) => t.text), ['three', 'four']);
  assert.deepEqual(store.turnsAfter(seen.seq, 1).map((t) => t.text), ['three']);
  assert.deepEqual(store.turnsAfter(store.lastSeq()), []);
  assert.equal(store.turnsAfter(0).length, 4);
});

test('a turn is never changed, not even by hand', (home) => {
  const store = room(home);
  say(store, 'general', 'human:zeus', 'salut');
  home.raw((db) => assert.throws(() => db.exec("UPDATE turns SET text = 'altceva'"), /append-only/));
  assert.equal(store.listTurns('general')[0].text, 'salut');
  store.close();
});

test('history and order survive a restart', (home) => {
  const first = room(home);
  say(first, 'general', 'human:zeus', 'înainte');
  first.close();

  const second = room(home);
  assert.deepEqual(second.listTurns('general').map((t) => t.text), ['înainte']);
  assert.equal(say(second, 'general', 'human:zeus', 'după').seq, 2);
  second.close();
});

test('a database from a newer portal is not touched', (home) => {
  home.raw((db) => home.setVersion(db, 99));
  assert.throws(() => new RoomStore(home.open()), /version 99/);
  home.raw((db) => assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE name = 'turns'").all(), [])); // nothing was made
});

// --- what the knowledge lacked ---


test('a question the knowledge could not answer is kept with how often it was asked, and the most asked comes first', (home) => {
  // the two syncs read the clock first, then one reading per gap
  const store = new RoomStore(home.open(), { now: dayClock('2026-10-29', '2026-10-29', '2026-10-29', '2026-10-30', '2026-10-31', '2026-10-31', '2026-11-01') });
  store.syncParticipants(PEOPLE);
  store.syncConversations(CHANNELS);

  store.recordGap({ conversationId: 'olympus', question: 'Putem sări pasul cu Styx?', why: 'model_found_nothing' });
  store.recordGap({ conversationId: 'general', question: 'Care e zeciuiala pentru Pegas?', why: 'model_found_nothing' });
  store.recordGap({ conversationId: 'general', question: '  putem   SĂRI pasul cu styx  ', why: 'no_real_source' }); // the same question, asked again: other case, spaces, no question mark
  store.recordGap({ conversationId: 'general', question: 'Cat dureaza Titanomahia', why: 'figures_unverified', sources: ['olympus/titanomachy.md'] }); // and this one without accents
  store.recordGap({ conversationId: 'olympus', question: 'Cât durează Titanomahia?', why: 'figures_unverified', sources: ['olympus/titanomachy.md'] });

  const gaps = store.listGaps();
  assert.deepEqual(gaps.map((g) => [g.question, g.asked]), [
    ['Cât durează Titanomahia?', 2], // asked twice, with and without accents; the latest wording is shown
    ['putem SĂRI pasul cu styx', 2], // the latest wording, counted with the first
    ['Care e zeciuiala pentru Pegas?', 1],
  ]);
  assert.deepEqual(gaps[1], { question: 'putem SĂRI pasul cu styx', why: 'no_real_source', sources: [], asked: 2, firstDay: '2026-10-29', lastDay: '2026-10-31', conversationId: 'general' });
  assert.deepEqual(gaps[0].sources, ['olympus/titanomachy.md']);
  assert.equal(gaps[0].lastDay, '2026-11-01');
  assert.equal(store.listGaps(1).length, 1);
});

test('a gap is a hole in the knowledge, not a record of a person: nobody is kept, and no time of day', (home) => {
  const store = room(home);
  store.recordGap({ conversationId: 'general', question: 'Ce e ambrozia?', why: 'model_found_nothing' });
  store.close();

  home.raw((db) => {
    assert.deepEqual(
      db.prepare('PRAGMA table_info(knowledge_gaps)').all().map((c) => c.name),
      ['id', 'day', 'conversation_id', 'question', 'key', 'why', 'sources'],
    );
    assert.match(db.prepare('SELECT day FROM knowledge_gaps').get().day, /^\d{4}-\d{2}-\d{2}$/);
  });
});

test('a gap that makes no sense is refused', (home) => {
  const store = room(home);
  refuses('invalid', () => store.recordGap({ conversationId: 'general', question: '   ', why: 'model_found_nothing' }));
  refuses('invalid', () => store.recordGap({ conversationId: 'general', question: 'x', why: 'because' }));
  refuses('not_found', () => store.recordGap({ conversationId: 'nowhere', question: 'x', why: 'model_found_nothing' }));
  assert.deepEqual(store.listGaps(), []);
});

test('a database made before the gap log gets it, and keeps everything it had', (home) => {
  const before = room(home);
  say(before, 'general', 'human:zeus', 'de dinainte');
  before.close();

  home.raw((db) => {
    db.exec('DROP TABLE knowledge_gaps;'); // as it was before this table existed
    home.setVersion(db, 1);
  });

  const after = new RoomStore(home.open());
  assert.deepEqual(after.listTurns('general').map((t) => t.text), ['de dinainte']);
  after.recordGap({ conversationId: 'general', question: 'ceva nou', why: 'model_found_nothing' });
  assert.equal(after.listGaps().length, 1);
  after.close();

  home.raw((db) => assert.equal(home.version(db), 7));
});

test('a database made before rooms had a kind, and guests had bindings and keys, gets them, and every room it had is a team room', (home) => {
  const before = room(home);
  say(before, 'general', 'human:zeus', 'de dinainte');
  before.close();

  home.raw((db) => {
    db.exec('DROP TABLE guest_keys;'); // and before a guest had a key
    db.exec('DROP TABLE bindings;'); // as it was before this table existed
    db.exec('ALTER TABLE conversations DROP COLUMN kind;'); // and before rooms had a kind
    home.setVersion(db, 5);
  });

  const after = new RoomStore(home.open());
  assert.deepEqual(after.listTurns('general').map((t) => t.text), ['de dinainte']);
  assert.deepEqual(after.listConversations().map((c) => [c.id, c.kind]), [['general', 'team'], ['olympus', 'team']]);
  after.syncConversations([{ id: 'guests', title: 'Guests', kind: 'guest' }]);
  const owl = after.addGuest('owl');
  after.addBinding({ id: 'b1', roomId: 'guests', participantId: owl.id, roleId: 'guest', activeFrom: 1, expiresAt: 2, budget: 3, ledgerId: 'l' });
  assert.deepEqual(after.bindingsOf(owl.id).map((b) => [b.roomId, b.budget]), [['guests', 3]]);
  after.createGuest({ alias: 'fox', room: 'guests', activeFrom: 1, expiresAt: 9, budget: 0, keyDigest: 'd'.repeat(64) });
  assert.equal(after.participantByGuestKey('d'.repeat(64)), 'guest:fox');
  after.close();

  home.raw((db) => assert.equal(home.version(db), 7));
});

// --- what the portal keeps ---


test('a portal lets go of what is older than it keeps, and of the questions asked before then', (home) => {
  const now = clock();
  const store = room(home, { now });
  say(store, 'general', 'human:zeus', 'old');
  store.recordGap({ conversationId: 'general', question: 'an old question', why: 'model_found_nothing' });
  now.days(10);
  say(store, 'general', 'human:zeus', 'ten days later');
  now.days(5); // the first message and the question are 15 days old now, the second 5

  assert.deepEqual(store.forget({ days: 14, messages: 999 }), { turns: 1, gaps: 1 });
  assert.deepEqual(store.listTurns('general').map((t) => t.text), ['ten days later']);
  assert.deepEqual(store.listGaps(), []);
  assert.deepEqual(store.forget({ days: 14, messages: 999 }), { turns: 0, gaps: 0 }); // a second time, nothing more
});

test('each room keeps at most its last messages, whichever ends first; the other rooms are not touched', (home) => {
  const store = room(home);
  for (let i = 1; i <= 5; i += 1) say(store, 'general', 'human:zeus', `g${i}`);
  say(store, 'olympus', 'human:hera', 'o1');
  say(store, 'olympus', 'human:hera', 'o2');

  assert.equal(store.forget({ days: 14, messages: 3 }).turns, 2);
  assert.deepEqual(store.listTurns('general').map((t) => t.text), ['g3', 'g4', 'g5']);
  assert.deepEqual(store.listTurns('olympus').map((t) => t.text), ['o1', 'o2']);
});

test('a portal that keeps everything says so, and forgets nothing', (home) => {
  const now = clock();
  const store = room(home, { now });
  say(store, 'general', 'human:zeus', 'old');
  now.days(400);
  assert.deepEqual(store.forget('forever'), { turns: 0, gaps: 0 });
  assert.equal(store.listTurns('general').length, 1);
});

test('the order goes on after everything was forgotten: no number is given twice', (home) => {
  const now = clock();
  const store = room(home, { now });
  say(store, 'general', 'human:zeus', 'one');
  const two = say(store, 'general', 'human:zeus', 'two');
  now.days(20);
  store.forget({ days: 14, messages: 999 });
  assert.equal(store.lastSeq(), two.seq); // where the portal is, even with nothing left to read
  assert.equal(say(store, 'general', 'human:zeus', 'three').seq, two.seq + 1);
  assert.deepEqual(store.turnsAfter(two.seq).map((t) => t.text), ['three']);
});


test('a database made before forgetting lets go of its old turns once it is opened by this version', (home) => {
  const before = room(home);
  say(before, 'general', 'human:zeus', 'from before');
  before.close();
  home.raw((db) => {
    home.setVersion(db, 2);
    db.exec("CREATE TRIGGER turns_no_delete BEFORE DELETE ON turns BEGIN SELECT RAISE(ABORT, 'turns are append-only'); END;");
  });

  const after = new RoomStore(home.open());
  assert.equal(after.forget({ days: 14, messages: 999 }).turns, 0); // nothing old yet, and no trigger in the way
  assert.equal(after.forget({ days: 14, messages: 50 }).turns, 0);
  after.close();
  home.raw((db) =>
    assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name").all().map((r) => r.name), ['turns_no_update']),
  );
});
}

// --- only in the first home: a file, with its write-ahead log ---

nodeTest('what is forgotten is gone from the file too, not only from the answers', () => {
  const home = HOMES['a file']();
  try {
    const { path } = home;
    const now = clock();
    const store = room(home, { now });
    say(store, 'general', 'human:zeus', 'a sentence that must leave no trace 7f3a');
    store.syncConversations([{ id: 'general', title: 'General' }]); // more writes after it, so its frame sits in the log
    now.days(20);
    store.forget({ days: 14, messages: 999 });
    // while the portal still runs: neither the file nor its write-ahead log holds it
    const trace = (file) => existsSync(file) && readFileSync(file).toString('latin1').includes('7f3a');
    assert.equal(trace(path), false);
    assert.equal(trace(`${path}-wal`), false);
    store.close();
    assert.equal(trace(path), false);
  } finally {
    home.done();
  }
});
