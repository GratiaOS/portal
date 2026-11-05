import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ConfigError, SlidingWindowLimiter, createAuthenticator, loadConfig, parseConfig } from '../dist/index.js';

const TOKEN_A = 'a'.repeat(24);
const TOKEN_B = 'b'.repeat(24);

const valid = () => ({
  participants: [
    { kind: 'human', alias: 'Zeus', token: TOKEN_A, locale: 'ro' },
    { kind: 'human', alias: 'Hera', token: TOKEN_B },
    { kind: 'companion', alias: 'Nova', capabilities: ['answer'] },
  ],
  rooms: [{ id: 'general', title: 'General' }],
});

const refuses = (raw, pattern) =>
  assert.throws(
    () => parseConfig(raw, '/base'),
    (err) => {
      assert.ok(err instanceof ConfigError, String(err));
      assert.match(err.message, pattern);
      // whatever is wrong, a token never ends up in a message
      assert.equal(err.message.includes(TOKEN_A) || err.message.includes(TOKEN_B), false);
      return true;
    },
  );

test('a config gets its defaults: local only, a database in data/, sensible limits', () => {
  const config = parseConfig(valid(), '/base');
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3100);
  assert.equal(config.dbPath, '/base/data/portal.db');
  assert.deepEqual(config.retention, { days: 14, messages: 999 }); // a portal forgets by default
  assert.deepEqual(config.rateLimit, { messages: 10, perSeconds: 10 });
  assert.equal(config.maxStreamsPerParticipant, 10);
  assert.equal(config.participants.length, 3);
  assert.equal(parseConfig({ ...valid(), dbPath: ':memory:' }).dbPath, ':memory:');
  assert.equal(parseConfig({ ...valid(), dbPath: '/var/lib/room.db' }).dbPath, '/var/lib/room.db');
});

test('humans need a long token; companions must have none', () => {
  const noToken = valid();
  delete noToken.participants[0].token;
  refuses(noToken, /human:Zeus needs a token of at least 24/);

  const shortToken = valid();
  shortToken.participants[0].token = 'short';
  refuses(shortToken, /human:Zeus needs a token/);

  const botToken = valid();
  botToken.participants[2].token = TOKEN_A + 'x';
  refuses(botToken, /companion:Nova must not have a token/);
});

test('the same token, alias or channel twice is refused', () => {
  const sameToken = valid();
  sameToken.participants[1].token = TOKEN_A;
  refuses(sameToken, /same token as another participant/);

  const sameAlias = valid();
  sameAlias.participants[2].alias = 'zeus';
  refuses(sameAlias, /alias "zeus" is used twice/);

  const sameChannel = valid();
  sameChannel.rooms.push({ id: 'general', title: 'Again' });
  refuses(sameChannel, /room id is used twice/);
});

test('what is missing or malformed is named', () => {
  refuses(null, /JSON object/);
  refuses([], /JSON object/);
  refuses({ ...valid(), participants: [] }, /at least one human/);
  refuses({ ...valid(), participants: [{ kind: 'companion', alias: 'Nova' }] }, /at least one human/);
  refuses({ ...valid(), rooms: [] }, /at least one room/);
  refuses({ ...valid(), rooms: [{ id: 'Bad Id', title: 'x' }] }, /not a valid room id/);
  refuses({ ...valid(), rooms: [{ id: 'ok' }] }, /rooms\[0\]\.title/);
  refuses({ ...valid(), participants: [{ kind: 'robot', alias: 'x1', token: TOKEN_A }] }, /kind must be/);
  refuses({ ...valid(), participants: [{ kind: 'human', alias: 'bad name', token: TOKEN_A }] }, /not a valid alias/);
  refuses({ ...valid(), port: 70000 }, /port must be a whole number/);
  refuses({ ...valid(), port: '3100' }, /port must be a whole number/);
  refuses({ ...valid(), rateLimit: { messages: 0 } }, /rateLimit\.messages/);
  refuses({ ...valid(), rateLimit: 5 }, /rateLimit must be an object/);
});

test('a token finds its participant, and nothing else does', () => {
  const authenticate = createAuthenticator(parseConfig(valid(), '/base'));
  assert.equal(authenticate(TOKEN_A), 'human:zeus');
  assert.equal(authenticate(TOKEN_B), 'human:hera');
  assert.equal(authenticate(TOKEN_A + 'x'), undefined);
  assert.equal(authenticate(''), undefined);
  assert.equal(authenticate('Nova'), undefined);
});

test('a config file is read from disk, with the database next to it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'room-config-'));
  try {
    const path = join(dir, 'portal.local.json');
    writeFileSync(path, JSON.stringify(valid()));
    assert.equal(loadConfig(path).dbPath, join(dir, 'data/portal.db'));

    assert.throws(() => loadConfig(join(dir, 'missing.json')), /cannot read .*copy portal\.example\.json/);
    writeFileSync(path, '{ not json');
    assert.throws(() => loadConfig(path), /is not valid JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the example config is a starting point, not a working config: the tokens are for you to make', () => {
  const dir = mkdtempSync(join(tmpdir(), 'room-example-'));
  try {
    copyFileSync(new URL('../portal.example.json', import.meta.url), join(dir, 'portal.json'));
    // no tokens file yet: the room says what to run, and it names a person and a file, never a token
    assert.throws(() => loadConfig(join(dir, 'portal.json')), /cannot read the tokens file .*portal\.tokens\.local\.json; make a token with: pnpm --filter portal tokens/);
    // with tokens in it the example is valid as it stands, Nova included
    writeFileSync(join(dir, 'portal.tokens.local.json'), JSON.stringify({ Zeus: '1'.repeat(24), Hera: '2'.repeat(24) }), { mode: 0o600 });
    assert.equal(loadConfig(join(dir, 'portal.json')).nova.alias, 'Nova');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the sliding window: so many in so long, counted over the last stretch of time', () => {
  let now = 1_000_000;
  const limiter = new SlidingWindowLimiter(3, 10_000, () => now);

  assert.equal(limiter.take('a'), 0);
  now += 1000;
  assert.equal(limiter.take('a'), 0);
  now += 1000;
  assert.equal(limiter.take('a'), 0);
  now += 1000;
  assert.equal(limiter.take('a'), 7000); // the first one was at 0 s, now is 3 s: it leaves the window in 7 s
  assert.equal(limiter.take('b'), 0); // somebody else is not affected
  now += 6999;
  assert.equal(limiter.take('a'), 1); // refused attempts are not counted
  now += 1;
  assert.equal(limiter.take('a'), 0); // the first one has just left the window
  assert.equal(limiter.take('a'), 1000); // and now the second is the oldest, 1 s from leaving
});

const withNova = (nova) => ({ ...valid(), nova });
const NOVA = { llm: { baseUrl: 'https://llm.example/v1', model: 'auto' }, knowledgeDir: 'knowledge' };

test('Nova: what she needs, and what she gets by default', () => {
  assert.equal(parseConfig(valid(), '/base').nova, undefined); // without the section the room is a plain chat

  const { nova } = parseConfig(withNova({ ...NOVA, llm: { ...NOVA.llm, apiKeyEnv: 'PORTAL_LLM_API_KEY', reasoningEffort: 'low', body: { x: 1 } } }), '/base');
  assert.equal(nova.alias, 'Nova');
  assert.equal(nova.knowledgeDir, '/base/knowledge');
  assert.deepEqual(nova.llm, { baseUrl: 'https://llm.example/v1', model: 'auto', apiKeyEnv: 'PORTAL_LLM_API_KEY', maxTokens: 4000, timeoutMs: 300000, reasoningEffort: 'low', body: { x: 1 } });
  assert.equal(nova.contextTurns, 12);
  assert.equal(nova.maxQueue, 5);
  assert.deepEqual(nova.examples, []); // none unless the company writes them
  assert.deepEqual(nova.exclude, []); // she reads everything under the folder unless told otherwise
  assert.deepEqual(nova.facts, []); // what only the company knows about the room: nothing unless it says
  assert.equal(parseConfig(withNova({ ...NOVA, alias: 'nova' }), '/base').nova.alias, 'Nova'); // the alias the participant has
  assert.equal(parseConfig(withNova({ ...NOVA, knowledgeDir: '/srv/kb' }), '/base').nova.knowledgeDir, '/srv/kb');
});

test('Nova: what is wrong is named, and a pasted key is never repeated', () => {
  const KEY = 'sk-live-0123456789abcdef'; // scrub-ok: a made-up key, to show it is never repeated
  refuses(withNova('yes'), /nova must be an object/);
  refuses(withNova({ ...NOVA, alias: 'Oracle' }), /nova\.alias "Oracle" must be a companion/);
  refuses(withNova({ ...NOVA, alias: 'Zeus' }), /nova\.alias "Zeus" must be a companion/);
  refuses(withNova({ ...NOVA, llm: undefined }), /nova\.llm must be an object/);
  refuses(withNova({ ...NOVA, llm: { model: 'auto' } }), /nova\.llm\.baseUrl/);
  refuses(withNova({ ...NOVA, llm: { ...NOVA.llm, baseUrl: 'not a url' } }), /must be a URL/);
  refuses(withNova({ ...NOVA, llm: { ...NOVA.llm, baseUrl: 'ftp://host/v1' } }), /http or https/);
  refuses(withNova({ ...NOVA, llm: { ...NOVA.llm, model: '' } }), /nova\.llm\.model/);
  refuses(withNova({ ...NOVA, llm: { ...NOVA.llm, reasoningEffort: 'extreme' } }), /low, medium or high/);
  refuses(withNova({ ...NOVA, llm: { ...NOVA.llm, body: [] } }), /nova\.llm\.body/);
  refuses(withNova({ ...NOVA, llm: { ...NOVA.llm, maxTokens: 10 } }), /nova\.llm\.maxTokens/);
  refuses(withNova({ ...NOVA, knowledgeDir: 42 }), /nova\.knowledgeDir/);
  refuses(withNova({ ...NOVA, knowledgeDir: undefined, exclude: ['private'] }), /nova\.exclude names parts of knowledgeDir, and there is no knowledgeDir/);
  assert.equal(parseConfig(withNova({ ...NOVA, knowledgeDir: undefined }), '/base').nova.knowledgeDir, undefined); // she may have none yet
  refuses(withNova({ ...NOVA, contextTurns: 0 }), /nova\.contextTurns/);
  // a sign given by the config is one emoji, and only a person has one
  refuses({ ...withNova(NOVA), participants: [{ kind: 'human', alias: 'Zeus', token: 'r'.repeat(24) }, { kind: 'companion', alias: 'Nova', sign: '✨' }] }, /companion:Nova must not have a sign: a sign is for the people in the room/);
  refuses({ ...withNova(NOVA), participants: [{ kind: 'human', alias: 'Zeus', token: 'r'.repeat(24), sign: 'leu' }, { kind: 'companion', alias: 'Nova' }] }, /sign must be one emoji/);
  assert.equal(parseConfig({ ...withNova(NOVA), participants: [{ kind: 'human', alias: 'Zeus', token: 'r'.repeat(24), sign: '🦁' }, { kind: 'companion', alias: 'Nova' }] }, '/base').participants[0].sign, '🦁');
  refuses(withNova({ ...NOVA, maxQueue: 500 }), /nova\.maxQueue/);

  // the file holds the NAME of the variable that has the key; pasting the key itself is caught, and not echoed
  assert.throws(
    () => parseConfig(withNova({ ...NOVA, llm: { ...NOVA.llm, apiKeyEnv: KEY } }), '/base'),
    (err) => err instanceof ConfigError && /NAME of an environment variable/.test(err.message) && !err.message.includes(KEY),
  );
});

test('nova.examples: a short list of questions in the company\'s words, trimmed', () => {
  assert.deepEqual(parseConfig(withNova({ ...NOVA, examples: ['  cine păzește porțile Olimpului? ', 'ce e ambrozia?'] }), '/base').nova.examples, ['cine păzește porțile Olimpului?', 'ce e ambrozia?']);
  refuses(withNova({ ...NOVA, examples: 'ce e ambrozia?' }), /nova.examples must be a list/);
  refuses(withNova({ ...NOVA, examples: Array.from({ length: 9 }, (_, i) => `întrebarea ${i}`) }), /at most 8/);
  refuses(withNova({ ...NOVA, examples: ['ok', '   '] }), /nova.examples\[1\]/);
  refuses(withNova({ ...NOVA, examples: ['x'.repeat(121)] }), /nova.examples\[0\]/);
  refuses(withNova({ ...NOVA, examples: [42] }), /nova.examples\[0\]/);
});

test('nova.facts: what the company knows about its room, a line at a time, tidied', () => {
  assert.deepEqual(parseConfig(withNova({ ...NOVA, facts: ['  The room is run by   the infrastructure team. ', 'Backups are nightly.'] }), '/base').nova.facts, ['The room is run by the infrastructure team.', 'Backups are nightly.']);
  refuses(withNova({ ...NOVA, facts: 'run by us' }), /nova.facts must be a list/);
  refuses(withNova({ ...NOVA, facts: Array.from({ length: 11 }, (_, i) => `fact ${i}`) }), /at most 10/);
  refuses(withNova({ ...NOVA, facts: ['ok', ' '] }), /nova.facts\[1\]/);
  refuses(withNova({ ...NOVA, facts: ['x'.repeat(301)] }), /nova.facts\[0\]/);
  refuses(withNova({ ...NOVA, facts: [7] }), /nova.facts\[0\]/);
});

test('nova.exclude: paths inside the knowledge folder that she never reads, tidied', () => {
  assert.deepEqual(parseConfig(withNova({ ...NOVA, exclude: ['partners/interfaces', ' ./offerings/tithes.md ', 'a\\b/'] }), '/base').nova.exclude, ['partners/interfaces', 'offerings/tithes.md', 'a/b']);
  refuses(withNova({ ...NOVA, exclude: 'partners' }), /nova.exclude must be a list/);
  refuses(withNova({ ...NOVA, exclude: Array.from({ length: 51 }, (_, i) => `p${i}`) }), /at most 50/);
  assert.deepEqual(parseConfig(withNova({ ...NOVA, exclude: ['private/./contract.md', './private/./', 'a/./b/.'] }), '/base').nova.exclude, ['private/contract.md', 'private', 'a/b']); // a `.` part is the folder itself
  for (const bad of ['', '   ', '.', './.', '/etc', '../up', 'a/../b', 'C:/x', 'a//b', 42]) refuses(withNova({ ...NOVA, exclude: [bad] }), /nova.exclude\[0\]/);
});

test('what a portal keeps: two weeks or 999 messages unless it says otherwise, and keeping everything is said openly', () => {
  assert.deepEqual(parseConfig({ ...valid(), retention: { days: 30 } }).retention, { days: 30, messages: 999 });
  assert.deepEqual(parseConfig({ ...valid(), retention: { messages: 200 } }).retention, { days: 14, messages: 200 });
  assert.equal(parseConfig({ ...valid(), retention: 'forever' }).retention, 'forever');
  refuses({ ...valid(), retention: 'always' }, /retention must be/);
  refuses({ ...valid(), retention: { days: 0 } }, /retention\.days/);
  refuses({ ...valid(), retention: { messages: 10 } }, /retention\.messages/);
});
