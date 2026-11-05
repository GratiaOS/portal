import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { CONTENT_SECURITY_POLICY, parseConfig, startRoom } from '../dist/index.js';

const PAGE = '<!doctype html><title>Room</title><script type="module" src="/assets/app-3f9a.js"></script>';

function build(t, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'room-ui-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const files = {
    'index.html': PAGE,
    'assets/app-3f9a.js': 'console.log("room");',
    'assets/app-77c1.css': 'body{margin:0}',
    'favicon.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
    'data.json': '{"a":1}',
    ...extra,
  };
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const config = (staticDir) =>
  parseConfig(
    {
      port: 0,
      dbPath: ':memory:',
      participants: [{ kind: 'human', alias: 'Zeus', token: 'r'.repeat(24) }],
      rooms: [{ id: 'general', title: 'General' }],
      ...(staticDir ? { staticDir } : {}),
    },
    '/base',
  );

async function open(t, dir) {
  const room = await startRoom(config(dir));
  t.after(() => room.close());
  return `http://127.0.0.1:${room.port}`;
}

/** A request with the path exactly as written: fetch would tidy `..` away before it left. */
function raw(base, path, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = request(`${base}`, { path, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

test('the page: served with a policy that lets it load only from the room, and never cached stale', async (t) => {
  const base = await open(t, build(t));
  const res = await fetch(`${base}/`);

  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  assert.equal(res.headers.get('content-security-policy'), CONTENT_SECURITY_POLICY);
  assert.match(CONTENT_SECURITY_POLICY, /default-src 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(await res.text(), PAGE);
});

test('the files of a build: their types, and the ones with a hash in the name kept for good', async (t) => {
  const base = await open(t, build(t));

  const js = await fetch(`${base}/assets/app-3f9a.js`);
  assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(js.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal(js.headers.has('content-security-policy'), false); // the policy is the page's, not the script's
  assert.equal(await js.text(), 'console.log("room");');

  assert.equal((await fetch(`${base}/assets/app-77c1.css`)).headers.get('content-type'), 'text/css; charset=utf-8');
  const icon = await fetch(`${base}/favicon.svg`);
  assert.equal(icon.headers.get('content-type'), 'image/svg+xml');
  assert.equal(icon.headers.get('cache-control'), 'no-cache'); // not under /assets: it may change
  assert.equal((await fetch(`${base}/data.json`)).headers.get('content-type'), 'application/json; charset=utf-8');
});

test('a reload deep inside the app lands in the app, and a file that is not there is not found', async (t) => {
  const base = await open(t, build(t));

  for (const path of ['/channels/olympus', '/login', '/a/b/c']) {
    const res = await fetch(`${base}${path}`);
    assert.equal(res.status, 200, path);
    assert.equal(await res.text(), PAGE);
  }
  for (const path of ['/assets/missing.js', '/nope.png', '/assets/app-3f9a.js.map']) assert.equal((await fetch(`${base}${path}`)).status, 404, path);
});

test('nothing outside the folder can be read, however the path is dressed', async (t) => {
  const dir = build(t);
  writeFileSync(join(dir, '..', 'secret-outside.txt'), 'not for the browser');
  t.after(() => rmSync(join(dir, '..', 'secret-outside.txt'), { force: true }));
  const base = await open(t, dir);

  for (const path of ['/../secret-outside.txt', '/assets/../../secret-outside.txt', '/%2e%2e/secret-outside.txt', '/..%2fsecret-outside.txt', '/assets/%2e%2e%2f%2e%2e%2fsecret-outside.txt', '/%00', '/assets\\..\\..\\secret-outside.txt']) {
    const { status, body } = await raw(base, path);
    assert.equal(body.includes('not for the browser'), false, path);
    assert.ok([200, 400, 404].includes(status), `${path} -> ${status}`);
    if (status === 200) assert.equal(body, PAGE, `${path} may only ever show the page`); // an extension-less oddity falls back to the app, never to a file
  }
  assert.equal((await raw(base, '/%E0%A4%A')).status, 400);
});

test('only reading: the wrong method is told which ones are right, and HEAD has no body', async (t) => {
  const base = await open(t, build(t));

  const post = await fetch(`${base}/`, { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');

  const head = await raw(base, '/assets/app-3f9a.js', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.headers['content-length'], String('console.log("room");'.length));
  assert.equal(head.body, '');
});

test('the pages need no token, and the API next to them still does', async (t) => {
  const base = await open(t, build(t));

  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/api/health`)).status, 200);
  assert.equal((await fetch(`${base}/api/me`)).status, 401);
  assert.equal((await fetch(`${base}/api/nothing`)).status, 401); // not served the page, and not told whether it exists
});

test('without a folder the room has only its API; a folder without a build is said, not silent', async (t) => {
  const base = await open(t, undefined);
  assert.equal((await fetch(`${base}/`)).status, 404);

  const warn = console.warn;
  const warned = [];
  console.warn = (...args) => warned.push(args.join(' '));
  try {
    const empty = mkdtempSync(join(tmpdir(), 'room-ui-empty-'));
    t.after(() => rmSync(empty, { recursive: true, force: true }));
    const emptyBase = await open(t, empty);
    assert.equal((await fetch(`${emptyBase}/`)).status, 404);
  } finally {
    console.warn = warn;
  }
  assert.equal(warned.length, 1);
  assert.match(warned[0], /has no index\.html; build the UI/);
});
