import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Hub, createApp, manifestFor, parseConfig } from '../dist/index.js';
import { room } from './helpers.mjs';

// The portal as an app on a home screen: its manifest is made from the config, asks for no key, and says nothing of what is said.
function app(name) {
  const store = room();
  const hub = new Hub(store, { graceMs: 20 });
  return createApp(store, hub, { version: '0.0.0-test', authenticate: () => undefined, name });
}
const get = (handler, path) => handler(new Request(`http://portal.test${path}`));

test('the manifest is the portal\'s own, with the name from its config, and needs no key', async () => {
  const res = await get(app('Firegate'), '/manifest.webmanifest');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^application\/manifest\+json/);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  const manifest = await res.json();
  assert.equal(manifest.name, 'Firegate');
  assert.equal(manifest.short_name, 'Firegate');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  assert.ok(manifest.icons.some((i) => i.sizes === '192x192') && manifest.icons.some((i) => i.sizes === '512x512'), 'icons the browsers need to offer the install');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'));
});

test('without a name it is El portal, and a long name is cut short for under the icon', async () => {
  assert.equal((await (await get(app(undefined), '/manifest.webmanifest')).json()).name, 'El portal');
  const long = manifestFor('Makers Mansion of the North');
  assert.equal(long.name, 'Makers Mansion of the North');
  assert.ok(long.short_name.length <= 12 && 'Makers Mansion of the North'.startsWith(long.short_name));
});

test('the name is in the health, for the page to put on its tab, and only when the portal has one', async () => {
  assert.equal((await (await get(app('Firegate'), '/api/health')).json()).name, 'Firegate');
  assert.equal('name' in (await (await get(app(undefined), '/api/health')).json()), false);
});

test('the manifest takes no other method than GET', async () => {
  const res = await app('x')(new Request('http://portal.test/manifest.webmanifest', { method: 'POST' }));
  assert.equal(res.status, 405);
});

test('the config names the portal, in one line', () => {
  const base = { participants: [{ kind: 'human', alias: 'Zeus', token: 'z'.repeat(24) }], rooms: [{ id: 'g', title: 'G' }], dbPath: ':memory:' };
  assert.equal(parseConfig({ ...base, name: 'Firegate' }, '/').name, 'Firegate');
  assert.equal(parseConfig(base, '/').name, undefined);
  assert.throws(() => parseConfig({ ...base, name: 'x'.repeat(41) }, '/'), /name/);
  assert.throws(() => parseConfig({ ...base, name: 'a\nb' }, '/'), /name/);
});

test('the service worker keeps the shell and never what is said: no /api, no /skins, no manifest, no other method than GET, no other origin', () => {
  const sw = readFileSync(new URL('../ui/public/sw.js', import.meta.url), 'utf8');
  for (const rule of ["startsWith('/api/')", "startsWith('/skins/')", "'/manifest.webmanifest'", "request.method !== 'GET'", 'url.origin !== self.location.origin']) assert.ok(sw.includes(rule), rule);
  // it keeps only the page itself and the files named by their content, and only what answered well
  const puts = [...sw.matchAll(/\.put\(([^,]+),/g)].map((m) => m[1]);
  assert.deepEqual(puts, ["'/'", 'request']);
  assert.equal((sw.match(/if \(fresh\.ok\)/g) ?? []).length, 2);
});

// the worker run for real, in a sandbox with a cache and a network of its own
async function worker(network) {
  const kept = new Map();
  const listeners = {};
  const caches = {
    keys: async () => ['portal-shell-v0'],
    delete: async () => true,
    open: async () => ({ put: async (key, response) => void kept.set(typeof key === 'string' ? key : new URL(key.url).pathname, response) }),
    match: async (key) => kept.get(typeof key === 'string' ? key : new URL(key.url).pathname),
  };
  const self = { location: { origin: 'http://portal.test' }, skipWaiting() {}, clients: { claim: async () => {} }, addEventListener: (type, fn) => (listeners[type] = fn) };
  const code = readFileSync(new URL('../ui/public/sw.js', import.meta.url), 'utf8');
  new Function('self', 'caches', 'fetch', 'URL', code)(self, caches, network, URL);
  const ask = async (path, init = {}) => {
    let answered;
    listeners.fetch({ request: { method: 'GET', mode: 'cors', url: `http://portal.test${path}`, ...init }, respondWith: (promise) => (answered = promise) });
    return answered === undefined ? undefined : answered.then((r) => r, (e) => e);
  };
  return { ask, kept };
}
const ok = (body) => ({ ok: true, body, clone() { return this; } });

test('the worker leaves /api, /skins, the manifest and other origins to the network, and keeps nothing of them', async () => {
  const seen = [];
  const { ask, kept } = await worker(async (request) => (seen.push(request.url), ok('x')));
  for (const path of ['/api/rooms/general/messages', '/api/stream', '/skins/any/skin.css', '/manifest.webmanifest', '/sw.js']) assert.equal(await ask(path), undefined, path);
  assert.equal(await ask('/api/rooms', { method: 'POST' }), undefined);
  assert.equal(await ask('/assets/x.js', { url: 'http://elsewhere.test/assets/x.js' }), undefined);
  assert.deepEqual([...kept.keys()], []);
  assert.deepEqual(seen, []);
});

test('the page is fetched first and kept, and served from what was kept when the line is down; a failed answer is not kept', async () => {
  let up = true;
  const { ask, kept } = await worker(async () => (up ? ok('PAGE') : Promise.reject(new Error('down'))));
  assert.equal((await ask('/rooms/general', { mode: 'navigate' })).body, 'PAGE');
  assert.deepEqual([...kept.keys()], ['/'], 'the shell only, under one name');
  up = false;
  assert.equal((await ask('/anything', { mode: 'navigate' })).body, 'PAGE', 'offline: the page that was kept');
  const bad = await worker(async () => ({ ok: false, clone() { return this; } }));
  await bad.ask('/', { mode: 'navigate' });
  assert.deepEqual([...bad.kept.keys()], [], 'a 500 is not the shell');
});

test('a file named by its content is kept for good: the network once, then what was kept', async () => {
  let asked = 0;
  const { ask } = await worker(async () => (asked += 1, ok('JS')));
  await ask('/assets/index-abc.js');
  await ask('/assets/index-abc.js');
  assert.equal(asked, 1);
  assert.equal(await ask('/some/other.json'), undefined, 'anything else is not the worker\'s');
});
