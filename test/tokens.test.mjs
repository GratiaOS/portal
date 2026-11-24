import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { createAuthenticator, loadConfig } from '../dist/index.js';
import { runTokens } from '../dist/tokens.js';

const run = promisify(execFile);
const QUARTZ = 'z'.repeat(30);
const FORGE = 'h'.repeat(30);

function room(t, { config = {}, tokens } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'room-tokens-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const body = {
    tokensFile: 'people.tokens.local.json',
    participants: [{ kind: 'human', alias: 'Quartz' }, { kind: 'human', alias: 'Forge' }, { kind: 'companion', alias: 'Nova' }],
    rooms: [{ id: 'general', title: 'General' }],
    ...config,
  };
  writeFileSync(join(dir, 'room.json'), JSON.stringify(body));
  if (tokens) writeFileSync(join(dir, 'people.tokens.local.json'), JSON.stringify(tokens), { mode: 0o600 });
  return { dir, config: join(dir, 'room.json'), tokensFile: join(dir, 'people.tokens.local.json') };
}

// what the command says, and whether it was a terminal it was talking to
function tokens(args, { isTTY = false } = {}) {
  let out = '';
  runTokens(args, { out: (text) => (out += text), isTTY });
  return out;
}

test('tokens file: the tokens of the humans are read from it, and they sign in', (t) => {
  const { config } = room(t, { tokens: { Quartz: QUARTZ, forge: FORGE } }); // the alias may be written in other letters
  const loaded = loadConfig(config);
  assert.equal(loaded.participants.find((p) => p.alias === 'Quartz').token, QUARTZ);
  assert.equal(loaded.participants.find((p) => p.alias === 'Forge').token, FORGE);
  assert.equal(loaded.participants.find((p) => p.alias === 'Nova').token, undefined);
  const who = createAuthenticator(loaded);
  assert.equal(who(QUARTZ), 'human:quartz');
  assert.equal(who(FORGE), 'human:forge');
});

test('tokens file: what is wrong is said by name of person and file, and never with a token in it', (t) => {
  const never = (fn, pattern) => assert.throws(fn, (err) => pattern.test(err.message) && !err.message.includes(QUARTZ) && !err.message.includes(FORGE));

  const none = room(t);
  never(() => loadConfig(none.config), /cannot read the tokens file .*people\.tokens\.local\.json; make a token with: pnpm --filter portal tokens/);

  const missing = room(t, { tokens: { Quartz: QUARTZ } });
  never(() => loadConfig(missing.config), /human:Forge has no token in .*people\.tokens\.local\.json; make one with: pnpm --filter portal tokens .*room\.json new Forge/);

  const stranger = room(t, { tokens: { Quartz: QUARTZ, Forge: FORGE, Hades: QUARTZ.replace('z', 'q') } });
  never(() => loadConfig(stranger.config), /has a token for "Hades", who is not a human in participants/);

  const twice = room(t, { tokens: { Quartz: QUARTZ, Forge: FORGE }, config: { participants: [{ kind: 'human', alias: 'Quartz', token: 'x'.repeat(30) }, { kind: 'human', alias: 'Forge' }] } });
  never(() => loadConfig(twice.config), /human:Quartz has a token in the config and in .*: keep it in one place/);

  const broken = room(t);
  writeFileSync(broken.tokensFile, '{ nope');
  never(() => loadConfig(broken.config), /is not valid JSON/);
  writeFileSync(broken.tokensFile, '["a"]');
  never(() => loadConfig(broken.config), /must be an object/);
  writeFileSync(broken.tokensFile, JSON.stringify({ Quartz: 42, Forge: FORGE }));
  never(() => loadConfig(broken.config), /the token of Quartz must be a string/);
  writeFileSync(broken.tokensFile, JSON.stringify({ Quartz: 'short', Forge: FORGE }));
  never(() => loadConfig(broken.config), /human:Quartz needs a token of at least 24 characters/);
});

test('tokens file: two entries that differ only in letters are two tokens for one person, and are refused by the room and by the command', (t) => {
  const { config, tokensFile } = room(t, { tokens: { Quartz: QUARTZ, quartz: FORGE, Forge: FORGE.replace('h', 'g') } });
  const said = (fn) => assert.throws(fn, (err) => /has both "Quartz" and "quartz": one token for each person/.test(err.message) && !err.message.includes(QUARTZ) && !err.message.includes(FORGE));
  said(() => loadConfig(config));
  said(() => tokens([config]));
  said(() => tokens([config, 'show', 'Quartz']));
  said(() => tokens([config, 'rotate', 'Quartz']));
  assert.equal(JSON.parse(readFileSync(tokensFile, 'utf8')).Quartz, QUARTZ); // and nothing was written
});

test('tokens file: a file that others can read is said so, once; one that only the owner can read is not', (t) => {
  if (process.platform === 'win32') return;
  const { config, tokensFile } = room(t, { tokens: { Quartz: QUARTZ, Forge: FORGE } });
  const warnings = [];
  const warn = console.warn;
  console.warn = (...args) => warnings.push(args.join(' '));
  t.after(() => (console.warn = warn));

  loadConfig(config);
  assert.deepEqual(warnings, []);
  chmodSync(tokensFile, 0o644);
  loadConfig(config);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /can be read by others; run: chmod 600 .*people\.tokens\.local\.json/);
  assert.equal(warnings[0].includes(QUARTZ), false);
});

test('tokens list: who has a token, and never the tokens', (t) => {
  const { config, tokensFile } = room(t, { tokens: { Quartz: QUARTZ } });
  const said = tokens([config]);
  assert.match(said, new RegExp(`tokens in ${tokensFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(said, /has a token {2}Quartz/);
  assert.match(said, /NO token {5}Forge/);
  assert.equal(said.includes(QUARTZ), false);
  assert.equal(tokens([config, 'list']), said);
  assert.match(tokens([]), /^usage: pnpm --filter portal tokens/);
  assert.match(tokens([config, 'nonsense']), /^usage:/);
});

test('tokens show: the token goes to a pipe, and not to a terminal unless asked', (t) => {
  const { config } = room(t, { tokens: { Quartz: QUARTZ, Forge: FORGE } });
  assert.equal(tokens([config, 'show', 'Quartz']), `${QUARTZ}\n`);
  assert.equal(tokens([config, 'show', 'forge']), `${FORGE}\n`);
  assert.throws(() => tokens([config, 'show', 'Quartz'], { isTTY: true }), /not printing a token to a terminal.*pipe it/);
  assert.equal(tokens([config, 'show', 'Quartz', '--reveal'], { isTTY: true }), `${QUARTZ}\n`);
  assert.throws(() => tokens([config, 'show']), /show needs a name/);
  assert.throws(() => tokens([config, 'show', 'Hades']), /"Hades" is not a human in .*the humans are: Quartz, Forge/);
  assert.throws(() => tokens([config, 'show', 'Nova']), /not a human/);

  const bare = room(t, { tokens: { Quartz: QUARTZ } });
  assert.throws(() => tokens([bare.config, 'show', 'Forge']), /Forge has no token; make one with: pnpm --filter portal tokens .* new Forge/);
});

test('tokens new: a token is made for someone who has none, in a file only the owner reads, and is not printed', (t) => {
  const { config, tokensFile } = room(t, { tokens: { Quartz: QUARTZ } });
  const said = tokens([config, 'new', 'Forge']);
  const kept = JSON.parse(readFileSync(tokensFile, 'utf8'));
  assert.equal(kept.Quartz, QUARTZ); // the others are as they were
  assert.match(kept.Forge, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(said.includes(kept.Forge), false);
  assert.match(said, /made the token of Forge in [\s\S]*the portal reads it when it starts/);
  assert.match(said, /tokens .* show Forge \| pbcopy/);
  if (process.platform !== 'win32') assert.equal(statSync(tokensFile).mode & 0o777, 0o600);
  assert.doesNotThrow(() => loadConfig(config)); // and now the room can start

  assert.throws(() => tokens([config, 'new', 'Forge']), /Forge already has a token; `rotate` replaces it/);
});

test('tokens new: the file is made when there is none, and Hades is not a human here', (t) => {
  const { config, tokensFile } = room(t);
  tokens([config, 'new', 'Quartz']);
  tokens([config, 'new', 'forge']); // in other letters: the alias of the config is kept
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(tokensFile, 'utf8'))), ['Quartz', 'Forge']);
  assert.throws(() => tokens([config, 'new', 'Hades']), /is not a human/);
  assert.throws(() => tokens([config, 'new']), /new needs a name/);
});

test('tokens rotate: replaces a token, says the old one stops at the next start, and refuses where there is nothing to replace', (t) => {
  const { config, tokensFile } = room(t, { tokens: { Quartz: QUARTZ, Forge: FORGE } });
  const said = tokens([config, 'rotate', 'Quartz']);
  const kept = JSON.parse(readFileSync(tokensFile, 'utf8'));
  assert.notEqual(kept.Quartz, QUARTZ);
  assert.equal(kept.Forge, FORGE);
  assert.match(said, /replaced the token of Quartz/);
  assert.match(said, /the old token stops working when the portal restarts/);
  assert.equal(createAuthenticator(loadConfig(config))(QUARTZ), undefined);

  const bare = room(t, { tokens: { Quartz: QUARTZ } });
  assert.throws(() => tokens([bare.config, 'rotate', 'Forge']), /Forge has no token to replace; `new` makes one/);
});

test('tokens: a config that keeps its tokens inside it can be listed and shown, but not written to', (t) => {
  const inline = room(t, { config: { tokensFile: undefined, participants: [{ kind: 'human', alias: 'Quartz', token: QUARTZ }, { kind: 'human', alias: 'Forge' }] } });
  assert.match(tokens([inline.config]), /tokens inside the config \(no "tokensFile"\)\n {2}has a token {2}Quartz\n {2}NO token {5}Forge/);
  assert.equal(tokens([inline.config, 'show', 'Quartz']), `${QUARTZ}\n`);
  assert.throws(() => tokens([inline.config, 'new', 'Forge']), /keeps its tokens inside it; add "tokensFile"/);

  const mixed = room(t, { config: { participants: [{ kind: 'human', alias: 'Quartz', token: QUARTZ }, { kind: 'human', alias: 'Forge' }] } });
  assert.throws(() => tokens([mixed.config, 'rotate', 'Quartz']), /has a token inside the config; move it to .* first/);
});

test('tokens, as a command: the token comes out alone, so that it can be piped', async (t) => {
  const { config } = room(t, { tokens: { Quartz: QUARTZ, Forge: FORGE } });
  const script = new URL('../dist/tokens.js', import.meta.url).pathname;
  const shown = await run(process.execPath, [script, config, 'show', 'Forge']);
  assert.equal(shown.stdout, `${FORGE}\n`);
  await assert.rejects(run(process.execPath, [script, config, 'show', 'Hades']), (err) => err.code === 1 && /portal tokens: "Hades" is not a human/.test(err.stderr));
});

test('in the image there is no pnpm and no clipboard, and the messages say what is there', async (t) => {
  const { config } = room(t, { tokens: { Quartz: QUARTZ } });
  const script = new URL('../dist/tokens.js', import.meta.url).pathname;
  const env = { ...process.env, PORTAL_IMAGE: '1' };
  const made = await run(process.execPath, [script, config, 'new', 'Forge'], { env });
  assert.match(made.stdout, /give it to them:  node dist\/tokens\.js .* show Forge\n/);
  assert.doesNotMatch(made.stdout, /pnpm|pbcopy/);
  const usage = await run(process.execPath, [script], { env }).catch((err) => err);
  assert.match(usage.stderr + usage.stdout, /^usage: node dist\/tokens\.js /);
  assert.doesNotMatch(usage.stderr + usage.stdout, /pnpm|pbcopy/);
});
