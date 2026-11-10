import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SkinFolder } from '../dist/index.js';

const script = fileURLToPath(new URL('../scripts/dev.mjs', import.meta.url));
const skins = fileURLToPath(new URL('../skins', import.meta.url));

/** `pnpm dev`, run for real: what it says, and a portal that answers on the address it gave. */
function boot(...args) {
  const child = spawn(process.execPath, [script, '--port', '0', '--no-build', ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
  let text = '';
  const done = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`it did not start: ${text}`)), 15_000);
    child.stdout.on('data', (chunk) => {
      text += chunk;
      if (text.includes('Ctrl-C to stop')) (clearTimeout(timer), resolve(text));
    });
    child.once('exit', () => reject(new Error(`it stopped: ${text}`)));
  });
  return { child, done };
}

test('pnpm dev: a portal with nothing to set up, a key for each person printed, a door for visitors, the portal as an app', async (t) => {
  const { child, done } = boot('--people', 'Ada,Bo');
  t.after(() => child.kill('SIGTERM'));
  const text = await done;
  const base = /This machine\s+(http:\/\/127\.0\.0\.1:\d+)\//.exec(text)?.[1];
  assert.ok(base, text);
  assert.match(text, /only this machine/);
  assert.doesNotMatch(text, /plain HTTP/);

  const key = (name) => new RegExp(`${name}\\s+(\\S{30,})`).exec(text)?.[1];
  assert.ok(key('Ada') && key('Bo') && key('Ada') !== key('Bo'), 'a different key for each person');
  const me = await (await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${key('Ada')}` } })).json();
  assert.equal(me.id, 'human:ada');

  const visitor = await fetch(`${base}/api/guest`, { method: 'POST' });
  assert.equal(visitor.status, 201, 'the door for visitors is open');
  assert.equal((await (await fetch(`${base}/manifest.webmanifest`)).json()).name, 'El portal (try it)');
});

test('pnpm dev:lan says it is on the network, and that the keys travel in the clear there', async (t) => {
  const { child, done } = boot('--lan');
  t.after(() => child.kill('SIGTERM'));
  const text = await done;
  assert.match(text, /plain HTTP/);
  assert.match(text, /Your network/);
  assert.doesNotMatch(text, /only this machine/);
});

test('the template look is one a portal accepts, and says its own name', () => {
  const found = new SkinFolder(skins).list();
  assert.deepEqual(found.map((s) => s.id), ['template'], 'the folder holds the template and nothing is refused');
  assert.equal(found[0].extends, 'bank');
});
