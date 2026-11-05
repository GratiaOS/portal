import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { BUILT_IN_SKINS, Hub, RoomStore, nodeSqlite, SkinFolder, checkSkinCss, createApp, toNodeListener, createAuthenticator, parseConfig } from '../dist/index.js';

const GOOD = "/* a skin */\n:root[data-skin='paper'] {\n  --ink: #222;\n  [data-part='bubble'] { background: url('bg.svg'); }\n}\n@keyframes paper-fade { from { opacity: 0 } to { opacity: 1 } }\n@font-face { font-family: 'paper-serif'; src: url('paper.woff2'); }\n";

test('skin css: everything inside its own scope, its own keyframes, and no way out', () => {
  assert.equal(checkSkinCss(GOOD, 'paper'), undefined);
  assert.equal(checkSkinCss(":root[data-skin=\"paper\"] { color: red }", 'paper'), undefined); // either kind of quote
  assert.equal(checkSkinCss(":root[data-skin='paper'] { content: '}{;' }", 'paper'), undefined); // a string may hold braces

  // a face is registered for the whole page: it must carry the skin's name, or it could change the look of another
  assert.equal(checkSkinCss(":root[data-skin='paper'] { color: red }\n@font-face { font-family: paper-sans; src: url(a.woff2) }", 'paper'), undefined);
  assert.equal(checkSkinCss(":root[data-skin='paper'] { color: red }\n@font-face { src: url(a.woff2); font-family: \"Paper-Mono\" }", 'paper'), undefined);
  assert.match(checkSkinCss(":root[data-skin='paper'] { color: red }\n@font-face { font-family: 'Georgia'; src: url(a.woff2) }", 'paper'), /must name its family paper-… \(this one says "georgia"\)/);
  assert.match(checkSkinCss(":root[data-skin='paper'] { color: red }\n@font-face { font-family: paper; src: url(a.woff2) }", 'paper'), /must name its family paper-…/);
  assert.match(checkSkinCss(":root[data-skin='paper'] { color: red }\n@font-face { src: url(a.woff2) }", 'paper'), /this one says nothing/);
  assert.match(checkSkinCss("body { color: red }", 'paper'), /rule outside its scope: body/);
  assert.match(checkSkinCss(":root[data-skin='other'] { color: red }", 'paper'), /outside its scope/);
  assert.match(checkSkinCss(":root[data-skin='paper'] { color: red }\n[data-part='bubble'] { color: red }", 'paper'), /outside its scope/);
  assert.match(checkSkinCss(":root[data-skin='paper'] { color: red }\n@keyframes fade { from { opacity: 0 } }", 'paper'), /outside its scope: @keyframes fade/);
  assert.match(checkSkinCss("@import 'x.css';\n:root[data-skin='paper'] { color: red }", 'paper'), /statement outside its rules: @import/);
  assert.match(checkSkinCss(":root[data-skin='paper'] { background: url(https://example.com/a.png) }", 'paper'), /from another place/);
  assert.match(checkSkinCss(":root[data-skin='paper'] { background: url(//example.com/a.png) }", 'paper'), /from another place/);
  assert.equal(checkSkinCss(":root[data-skin='paper'] { background: url(data:image/png;base64,AAAA) }", 'paper'), undefined);
  assert.match(checkSkinCss(":root[data-skin='paper'] { color: red ", 'paper'), /never closed/);
  assert.match(checkSkinCss(":root[data-skin='paper'] { color: red } }", 'paper'), /without a \{/);
  assert.match(checkSkinCss("/* nothing */", 'paper'), /no block of its own/);
  assert.match(checkSkinCss(`:root[data-skin='paper'] { color: red }\n${'x'.repeat(260_000)}`, 'paper'), /larger than/);
});

function folder(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'room-skins-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) put(dir, path, content);
  return dir;
}

function put(dir, path, content, secondsFromNow = 0) {
  const full = join(dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  const when = new Date(Date.now() + secondsFromNow * 1000);
  utimesSync(full, when, when);
}

const manifest = (extra = {}) => JSON.stringify({ id: 'paper', name: 'Paper', emoji: '📄', ...extra });

test('a folder of skins: the good ones are listed, and each bad one says what is wrong with it', (t) => {
  const dir = folder(t, {
    'paper/skin.json': manifest({ extends: 'bank' }),
    'paper/skin.css': GOOD,
    'wrongid/skin.json': manifest(),
    'wrongid/skin.css': GOOD,
    'bank/skin.json': JSON.stringify({ id: 'bank', name: 'Bank' }),
    'bank/skin.css': ":root[data-skin='bank'] { color: red }",
    'Loud/skin.json': manifest(),
    'Loud/skin.css': GOOD,
    'nocss/skin.json': JSON.stringify({ id: 'nocss', name: 'No css' }),
    'badjson/skin.json': '{ nope',
    'badjson/skin.css': GOOD,
    'leaky/skin.json': JSON.stringify({ id: 'leaky', name: 'Leaky' }),
    'leaky/skin.css': 'body { color: red }',
    'noname/skin.json': JSON.stringify({ id: 'noname' }),
    'noname/skin.css': ":root[data-skin='noname'] { color: red }",
    'orphan/skin.json': JSON.stringify({ id: 'orphan', name: 'Orphan', extends: 'neon' }),
    'orphan/skin.css': ":root[data-skin='orphan'] { color: red }",
    '.hidden/skin.json': manifest(),
    'readme.txt': 'not a folder',
  });
  const { skins, problems } = new SkinFolder(dir).scan();
  assert.deepEqual(skins, [{ id: 'paper', name: 'Paper', emoji: '📄', extends: 'bank' }]);
  const said = problems.join('\n');
  assert.match(said, /bank: this name belongs to a look the page has built in/);
  assert.match(said, /Loud: the name of the folder must be lower case/);
  assert.match(said, /nocss: needs a skin.json and a skin.css/);
  assert.match(said, /badjson: skin.json is not valid JSON/);
  assert.match(said, /leaky: skin.css has a rule outside its scope/);
  assert.match(said, /noname: skin.json needs a name/);
  assert.match(said, /orphan: extends must be one of bubbles, bank, radar/);
  assert.match(said, /wrongid: skin.json says id "paper", and the folder is wrongid/);
  assert.equal(problems.length, 8);
  assert.deepEqual(BUILT_IN_SKINS, ['bubbles', 'bank', 'radar']);
});

test('a skin is looked at again when it changes, and one can be added while the room runs', (t) => {
  const dir = folder(t, { 'paper/skin.json': manifest(), 'paper/skin.css': GOOD });
  const skins = new SkinFolder(dir);
  assert.deepEqual(skins.list().map((s) => s.id), ['paper']);
  put(dir, 'paper/skin.css', 'body { color: red }', 5);
  assert.deepEqual(skins.list(), []); // now it leaks
  put(dir, 'paper/skin.css', GOOD, 10);
  assert.deepEqual(skins.list().map((s) => s.id), ['paper']);
  put(dir, 'ink/skin.json', JSON.stringify({ id: 'ink', name: 'Ink' }), 15);
  put(dir, 'ink/skin.css', ":root[data-skin='ink'] { color: red }", 15);
  assert.deepEqual(skins.list().map((s) => s.id), ['ink', 'paper']);
  assert.equal(skins.find('ink')?.name, 'Ink');
  assert.equal(skins.find('nope'), undefined);
  assert.equal(skins.find('../paper'), undefined);
  assert.deepEqual(new SkinFolder(join(dir, 'missing')).scan().skins, []);
});

const TOKEN = 't'.repeat(24);

async function room(t, dir) {
  const config = parseConfig({ participants: [{ kind: 'human', alias: 'Athena', token: TOKEN }], rooms: [{ id: 'general', title: 'General' }], dbPath: ':memory:' }, '/base');
  const store = new RoomStore(nodeSqlite(':memory:'));
  store.syncParticipants(config.participants.map(({ kind, alias }) => ({ kind, alias })));
  store.syncConversations(config.rooms);
  const hub = new Hub(store, { graceMs: 25 });
  const skins = new SkinFolder(dir);
  const server = createServer(toNodeListener(createApp(store, hub, { version: '0.0.0-test', authenticate: createAuthenticator(config), skins })));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    hub.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

test('the room serves the files of a good skin, to anyone, and only those', async (t) => {
  const dir = folder(t, {
    'paper/skin.json': manifest(),
    'paper/skin.css': GOOD,
    'paper/bg.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'paper/fonts/paper.woff2': 'wOF2',
    'paper/notes.txt': 'not a kind of file a skin holds',
    'paper/.secret.css': 'hidden',
    'leaky/skin.json': JSON.stringify({ id: 'leaky', name: 'Leaky' }),
    'leaky/skin.css': 'body { color: red }',
    'outside.css': 'not in a skin',
  });
  symlinkSync(join(dir, 'outside.css'), join(dir, 'paper', 'link.css'));
  const base = await room(t, dir);
  const get = (path, init) => fetch(base + path, init);

  const css = await get('/skins/paper/skin.css');
  assert.equal(css.status, 200);
  assert.match(css.headers.get('content-type'), /^text\/css/);
  assert.equal(css.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(css.headers.get('content-security-policy'), "sandbox; default-src 'none'");
  assert.equal(await css.text(), GOOD);
  assert.equal((await get('/skins/paper/bg.svg')).headers.get('content-type'), 'image/svg+xml');
  assert.equal((await get('/skins/paper/fonts/paper.woff2')).status, 200);
  assert.equal((await get('/skins/paper/skin.css', { method: 'HEAD' })).status, 200);

  for (const path of ['/skins/paper/skin.json', '/skins/paper/notes.txt', '/skins/paper/.secret.css', '/skins/paper/link.css', '/skins/paper/missing.css', '/skins/paper/../outside.css', '/skins/paper/%2e%2e/outside.css', '/skins/paper/..%2foutside.css', '/skins/leaky/skin.css', '/skins/nope/skin.css', '/skins/paper/', '/skins/paper', '/skins/', '/skins/%00/skin.css']) {
    const res = await get(path);
    assert.ok([400, 404].includes(res.status), `${path} answered ${res.status}`);
  }
  assert.equal((await get('/skins/paper/skin.css', { method: 'POST' })).status, 405);
});

test('the list of skins needs a token, like the rest of the api', async (t) => {
  const dir = folder(t, { 'paper/skin.json': manifest(), 'paper/skin.css': GOOD, 'leaky/skin.json': JSON.stringify({ id: 'leaky', name: 'Leaky' }), 'leaky/skin.css': 'body {}' });
  const base = await room(t, dir);
  assert.equal((await fetch(`${base}/api/skins`)).status, 401);
  const res = await fetch(`${base}/api/skins`, { headers: { Authorization: `Bearer ${TOKEN}` } });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { skins: [{ id: 'paper', name: 'Paper', emoji: '📄' }] });
});

test('without a skins folder: nothing to list, and nothing under /skins', async (t) => {
  const config = parseConfig({ participants: [{ kind: 'human', alias: 'Athena', token: TOKEN }], rooms: [{ id: 'general', title: 'General' }], dbPath: ':memory:' }, '/base');
  const store = new RoomStore(nodeSqlite(':memory:'));
  store.syncParticipants(config.participants.map(({ kind, alias }) => ({ kind, alias })));
  const hub = new Hub(store, { graceMs: 25 });
  const server = createServer(toNodeListener(createApp(store, hub, { version: '0.0.0-test', authenticate: createAuthenticator(config) })));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    hub.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.deepEqual(await (await fetch(`${base}/api/skins`, { headers: { Authorization: `Bearer ${TOKEN}` } })).json(), { skins: [] });
  assert.equal((await fetch(`${base}/skins/paper/skin.css`)).status, 404);
});

test('skinsDir in the config is a folder next to the config file', () => {
  const base = { participants: [{ kind: 'human', alias: 'Athena', token: TOKEN }], rooms: [{ id: 'general', title: 'General' }] };
  assert.equal(parseConfig({ ...base, skinsDir: 'my-skins' }, '/base').skinsDir, '/base/my-skins');
  assert.equal(parseConfig(base, '/base').skinsDir, undefined);
  assert.throws(() => parseConfig({ ...base, skinsDir: '' }, '/base'), /skinsDir must be a non-empty string/);
});
