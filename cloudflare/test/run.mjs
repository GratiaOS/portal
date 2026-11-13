// Checks the Cloudflare home on this machine, with `wrangler dev`: nothing is deployed and no account is used. The page must
// be built first (`pnpm --filter portal-ui build`); `pnpm cloudflare:check` does both.
// Usage: node cloudflare/test/run.mjs     (WRANGLER=/path/to/wrangler to use one already installed)

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = join(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT ?? 8798);
const base = `http://127.0.0.1:${port}`;
const state = mkdtempSync(join(tmpdir(), 'portal-cloudflare-'));
const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf8'));
const page = join(here, '..', 'ui', 'dist', 'index.html');
let failures = 0;

const ZEUS = 'z'.repeat(24);
const HERA = 'h'.repeat(24);
// A stand-in for the model, on this machine: it answers every question the same way, and remembers what it was asked.
const asked = [];
const model = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    asked.push({ authorization: req.headers.authorization, body: JSON.parse(body) });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ model: 'stand-in', choices: [{ delta, finish_reason: finish }] })}\n\n`);
    chunk({ content: 'SAY: Ambrozia este hrana zeilor.\n' });
    chunk({ content: 'SOURCES: olympus/food.md' });
    chunk({}, 'stop');
    res.end('data: [DONE]\n\n');
  });
});
await new Promise((r) => model.listen(0, '127.0.0.1', r));

// and another for guests, which is not the team's: its own engine, its own key, its own answers
const askedForGuests = [];
const guestModel = createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    askedForGuests.push({ authorization: req.headers.authorization, body: JSON.parse(body) });
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta, finish = null) => res.write(`data: ${JSON.stringify({ model: 'guests-stand-in', choices: [{ delta, finish_reason: finish }] })}\n\n`);
    chunk({ content: 'SAY: Un portal este un chat de echipa, cu o companioana.\n' });
    chunk({ content: 'SOURCES: about.md' });
    chunk({}, 'stop');
    res.end('data: [DONE]\n\n');
  });
});
await new Promise((r) => guestModel.listen(0, '127.0.0.1', r));

// her folder: one file to read, one kept out of what she reads
const knowledgeDir = join(state, 'knowledge');
mkdirSync(join(knowledgeDir, 'olympus'), { recursive: true });
mkdirSync(join(knowledgeDir, 'private'), { recursive: true });
writeFileSync(join(knowledgeDir, 'olympus', 'food.md'), '# Food\n\nAmbrozia este hrana zeilor.\n');
writeFileSync(join(knowledgeDir, 'private', 'contract.md'), '# Contract\n\nSECRET-7f3a\n');

// the folder of public documents for guests: apart from hers, and holding nothing of the team's
const guestDir = join(state, 'public-docs');
mkdirSync(guestDir, { recursive: true });
writeFileSync(join(guestDir, 'about.md'), '# About\n\nUn portal este un chat de echipa, cu o companioana.\n');

const CONFIG = {
  name: 'Stand-in',
  participants: [
    { kind: 'human', alias: 'Zeus' },
    { kind: 'human', alias: 'Hera' },
    { kind: 'companion', alias: 'Nova' },
  ],
  rooms: [
    { id: 'general', title: 'General' },
    { id: 'guests', title: 'Guests', kind: 'guest' },
  ],
  guests: {
    room: 'guests',
    maxActive: 5,
    minutes: 30,
    perCaller: { count: 3, perMinutes: 10 },
    nova: { enabled: true, questions: 3, perHour: 20, knowledgeDir: guestDir, examples: ['what is a portal?'], llm: { baseUrl: `http://127.0.0.1:${guestModel.address().port}/v1`, model: 'guests-stand-in', apiKeyEnv: 'PORTAL_GUESTS_LLM_API_KEY' } },
  },
  retention: { days: 14, messages: 50 },
  rateLimit: { messages: 1000, perSeconds: 10 },
  nova: {
    alias: 'Nova',
    knowledgeDir,
    exclude: ['private'],
    examples: ['what do the gods eat?'],
    llm: { baseUrl: `http://127.0.0.1:${model.address().port}/v1`, model: 'stand-in', apiKeyEnv: 'PORTAL_LLM_API_KEY' },
  },
};

const check = (ok, line) => {
  if (!ok) failures += 1;
  console.log(`${ok ? '✓' : '✗'} ${line}`);
};

function start(config = CONFIG, tokens = { Zeus: ZEUS, Hera: HERA }) {
  const [command, ...pre] = process.env.WRANGLER ? [process.env.WRANGLER] : ['npx', '--yes', 'wrangler@4.136.2'];
  const vars = { PORTAL_CONFIG: JSON.stringify(config), PORTAL_TOKENS: JSON.stringify(tokens), PORTAL_FORGET_EVERY_MS: '1000', PORTAL_LLM_API_KEY: 'stand-in-key', PORTAL_GUESTS_LLM_API_KEY: 'guests-stand-in-key' };
  const args = [...pre, 'dev', '--port', String(port), '--ip', '127.0.0.1', '--persist-to', state, '--log-level', 'error', '--show-interactive-dev-session=false'];
  for (const [name, value] of Object.entries(vars)) args.push('--var', `${name}:${value}`);
  // its own process group, so that stopping it stops what `npx` started under it too (on Linux the SIGINT that reached only `npx` left the rest running)
  const child = spawn(command, args, { cwd: here, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  child.stderr.on('data', (d) => process.stderr.write(d));
  return child;
}

/** Stops `wrangler dev` and everything under it, and never waits for ever: asked politely, then, after five seconds, not. */
function stop(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    const signal = (name) => {
      try {
        process.kill(-child.pid, name); // the group
      } catch {
        try {
          child.kill(name);
        } catch {}
      }
    };
    const giveUp = setTimeout(() => {
      signal('SIGKILL');
      setTimeout(resolve, 1000);
    }, 5000);
    child.once('exit', () => {
      clearTimeout(giveUp);
      resolve();
    });
    signal('SIGTERM');
  });
}

async function ready() {
  for (let i = 0; i < 240; i += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('wrangler dev did not answer');
}

async function until(predicate, ms = 3000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await predicate()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

const as = (token) => (path, init = {}) => fetch(base + path, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
const zeus = as(ZEUS);
const hera = as(HERA);
const say = (call, text) => call('/api/rooms/general/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });

function listen(token) {
  const abort = new AbortController();
  const heard = { text: '', abort: () => abort.abort() };
  fetch(`${base}/api/stream`, { headers: { Authorization: `Bearer ${token}` }, signal: abort.signal })
    .then(async (response) => {
      const decoder = new TextDecoder();
      for await (const chunk of response.body) heard.text += decoder.decode(chunk, { stream: true });
    })
    .catch(() => {});
  return heard;
}

if (!existsSync(page)) {
  console.error(`no page at ${page}: build it first, pnpm --filter portal-ui build`);
  process.exit(1);
}

// her knowledge, bundled by the same script as for dev and deploy; what was bundled before is put back after
const bundle = join(here, 'knowledge.json');
const before = existsSync(bundle) ? readFileSync(bundle) : undefined;
const configFile = join(state, 'portal.cloudflare.local.json');
writeFileSync(configFile, JSON.stringify(CONFIG));
// a config the Worker would refuse bundles nothing: an exclude that is not a list must not let everything through
const badFile = join(state, 'bad.cloudflare.local.json');
writeFileSync(badFile, JSON.stringify({ ...CONFIG, nova: { ...CONFIG.nova, exclude: 'private' } }));
writeFileSync(bundle, '{"files":{"untouched.md":"x"}}\n');
const refused = spawnSync(process.execPath, [join(here, 'bundle-knowledge.mjs'), badFile], { encoding: 'utf8' });
const untouched = readFileSync(bundle, 'utf8').includes('untouched.md');
const bundled = spawnSync(process.execPath, [join(here, 'bundle-knowledge.mjs'), configFile], { encoding: 'utf8' });
const bundledJson = JSON.parse(readFileSync(bundle, 'utf8'));
const files = bundledJson.files;
const guestFiles = bundledJson.guestFiles;

let dev = start();
try {
  console.log('\n— her knowledge, bundled');
  check(refused.status !== 0 && untouched && /nova\.exclude/.test(refused.stderr), 'a config the Worker would refuse is refused before anything is bundled');
  check(bundled.status === 0 && Object.keys(files).join() === 'olympus/food.md', `the folder is read as in Node, what is excluded left out: ${Object.keys(files).join(', ')}`);
  check(bundled.status === 0 && Object.keys(guestFiles ?? {}).join() === 'about.md', `the folder for guests is bundled apart, and holds nothing of hers: ${Object.keys(guestFiles ?? {}).join(', ')}`);
  await ready();

  console.log('\n— the page, from the assets, with the headers it has in Node');
  const root = await fetch(`${base}/`);
  check(root.status === 200 && /^text\/html/.test(root.headers.get('content-type') ?? ''), `/ is the page (${root.status} ${root.headers.get('content-type')})`);
  check(/default-src 'self'/.test(root.headers.get('content-security-policy') ?? ''), 'the page under its policy');
  check(root.headers.get('cache-control') === 'no-cache' && root.headers.get('x-content-type-options') === 'nosniff', 'the page is asked for again, and not sniffed');
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(await root.text())?.[1];
  const asset = script ? await fetch(base + script) : undefined;
  check(asset?.status === 200 && asset.headers.get('cache-control') === 'public, max-age=31536000, immutable' && !asset.headers.has('content-security-policy'), `a file named by its content is kept for good (${script})`);
  const deep = await fetch(`${base}/rooms/general`);
  check(deep.status === 200 && /^text\/html/.test(deep.headers.get('content-type') ?? ''), 'a path of the page lands on the page');
  const missing = await fetch(`${base}/nothing-here.js`);
  check(missing.status === 404, `a file that is not there is a 404 (${missing.status} ${missing.headers.get('content-type')})`);
  check((await fetch(`${base}/`, { method: 'POST' })).status === 405, 'the page takes no POST');

  console.log('\n— the portal as an app: a manifest of its own, a worker for the shell, icons');
  const manifestRes = await fetch(`${base}/manifest.webmanifest`);
  const manifest = await manifestRes.json().catch(() => ({}));
  check(manifestRes.status === 200 && /^application\/manifest\+json/.test(manifestRes.headers.get('content-type') ?? '') && manifest.name === 'Stand-in', `the manifest is made from the config, with no key: ${manifest.name}`);
  const sw = await fetch(`${base}/sw.js`);
  check(sw.status === 200 && /javascript/.test(sw.headers.get('content-type') ?? '') && sw.headers.get('cache-control') === 'no-cache', `the service worker is asked for again each time (${sw.status} ${sw.headers.get('cache-control')})`);
  const icon = await fetch(`${base}/icons/icon-192.png`);
  check(icon.status === 200 && icon.headers.get('content-type') === 'image/png', `an icon is a png (${icon.status} ${icon.headers.get('content-type')})`);
  check((await (await fetch(`${base}/api/health`)).json()).name === 'Stand-in', 'and the health says the name');

  console.log('\n— the portal, from its object');
  const health = await (await fetch(`${base}/api/health`)).json();
  check(health.ok && health.version === pkg.version, `health, version ${health.version}`);
  check((await fetch(`${base}/api/rooms`)).status === 401, 'without a token, no answer');
  const me = await (await zeus('/api/me')).json();
  check(me.id === 'human:zeus', 'a token from PORTAL_TOKENS signs in');
  check((await zeus('/skins/any/skin.css')).status === 404, 'no skins from a folder: a calm 404');

  const heard = listen(ZEUS);
  check(await until(() => heard.text.includes('event: hello')), 'the stream says hello');
  await say(hera, 'salut de pe Cloudflare 🌱');
  check(await until(() => heard.text.includes('salut de pe Cloudflare 🌱')), 'a message from Hera reaches Zeus');

  console.log('\n— Nova, from the object');
  await say(zeus, '@Nova ce e ambrozia?');
  check(await until(() => heard.text.includes('"speakerId":"companion:nova"'), 10_000), 'Nova answers in the room');
  check(/Ambrozia este hrana zeilor\.[^"]*olympus\/food\.md/.test(heard.text), 'her answer, with the file she used');
  const question = asked.at(-1);
  const system = question?.body.messages.find((m) => m.role === 'system')?.content ?? '';
  check(question?.authorization === 'Bearer stand-in-key', 'the model is asked with the key from its secret');
  check(system.includes('### FILE: olympus/food.md') && !system.includes('SECRET-7f3a'), 'she reads the bundle, and not what was kept out');
  check(system.includes('on Cloudflare'), 'what she says of the portal is true here: what is said is kept on Cloudflare');
  heard.abort();

  console.log('\n— forgetting, at the object\'s alarm (every second here, ten minutes by default)');
  for (let i = 1; i <= 55; i += 1) await say(zeus, `m${i}`);
  const kept = async () => (await (await zeus('/api/rooms/general/messages?limit=200')).json()).turns.map((t) => t.text);
  check(await until(async () => (await kept()).length === 50, 5000), 'the room keeps its last 50, and lets go of the rest at the alarm');
  const left = await kept();
  check(left[0] === 'm6' && left.at(-1) === 'm55', `what is left is the last 50: ${left[0]} … ${left.at(-1)}`);

  console.log('\n— a guest, let in by the object, kept to one room');
  const entered = await fetch(`${base}/api/guest`, { method: 'POST' });
  const guest = await entered.json();
  check(entered.status === 201 && guest.participant?.kind === 'guest' && typeof guest.token === 'string', `a visitor is let in without a key: ${guest.participant?.alias}`);
  const asGuest = (path, init = {}) => fetch(base + path, { ...init, headers: { Authorization: `Bearer ${guest.token}`, ...init.headers } });
  check((await (await asGuest('/api/me')).json()).id === guest.participant.id, 'the key the object gave is the guest');
  check(JSON.stringify((await (await asGuest('/api/rooms')).json()).rooms.map((r) => r.id)) === '["guests"]', 'the guest is told of the guest room only');
  check((await asGuest('/api/rooms/general/messages')).status === 404, 'the team room does not exist for them');
  check((await asGuest('/api/rooms/guests/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'salut' }) })).status === 201, 'and they speak in their own');
  // the guest's stream ends with their time, which asks a timer of the runtime: on Cloudflare it is a number, with nothing to let go of
  const guestHeard = listen(guest.token);
  check(await until(() => guestHeard.text.includes('event: hello')), 'a guest\'s stream opens and says hello');
  check(guestHeard.text.includes('"id":"guests"') && !guestHeard.text.includes('"id":"general"'), 'and tells them of their room and of no other');
  guestHeard.abort();

  console.log('\n— the companion for guests, on an engine and from a folder of her own');
  const hints = await (await asGuest('/api/hints')).json();
  check(hints.companion === 'Nova' && JSON.stringify(hints.examples) === '["what is a portal?"]', `a guest is told of her companion with her examples, and never the team's: ${JSON.stringify(hints.examples)}`);
  const teamAsked = asked.length;
  await asGuest('/api/rooms/guests/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: '@Nova ce este un portal?' }) });
  const answered = await until(async () => (await (await asGuest('/api/rooms/guests/messages')).json()).turns.some((t) => t.speakerId === 'companion:nova' && /chat de echipa/.test(t.text)), 10_000);
  check(answered, 'she answers the guest, in the guest room');
  const forGuests = askedForGuests.at(-1);
  const guestSystem = forGuests?.body.messages?.[0]?.content ?? '';
  check(forGuests?.authorization === 'Bearer guests-stand-in-key', 'the guests\' engine is asked with the key of its own secret, not the team\'s');
  check(asked.length === teamAsked, 'the team\'s engine is not asked for a guest');
  check(guestSystem.includes('### FILE: about.md') && !guestSystem.includes('olympus/food.md') && !guestSystem.includes('SECRET-7f3a'), 'she reads the folder for guests, and nothing of the team\'s');
  check(!guestSystem.includes('Zeus') && !guestSystem.includes('Hera'), 'and no name of the team went to the guests\' engine');
  check(!(await (await zeus('/api/gaps')).text().catch(() => '')).includes('ce este un portal'), 'what the guest asked is not among what the knowledge lacked');

  console.log('\n— a person renamed in the config keeps what they said (the object is started again, with the same storage)');
  await say(hera, 'a word before the new name');
  await stop(dev);
  dev = start({ ...CONFIG, participants: CONFIG.participants.map((p) => (p.alias === 'Hera' ? { kind: 'human', alias: 'Athena', renamedFrom: 'Hera' } : p)) }, { Zeus: ZEUS, Athena: HERA });
  await ready();
  const renamed = await (await hera('/api/me')).json();
  check(renamed.id === 'human:athena', `the same key is now Athena: ${renamed.id}`);
  const hers = (await (await zeus('/api/rooms/general/messages')).json()).turns.find((t) => t.text === 'a word before the new name');
  check(hers?.speakerId === 'human:athena', `what she said is hers under the new name, and as it was said: ${hers?.speakerId}`);

  console.log('\n— wrong keys, counted in the object (last: it turns this caller away)');
  const wrong = [];
  for (let i = 0; i < 12; i += 1) wrong.push((await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer wrong${i}` } })).status);
  // a wrong key was already counted above (no token at all), so the wait comes at the tenth, not the eleventh
  const waits = wrong.indexOf(429);
  check(wrong[0] === 401 && waits >= 9 && waits <= 10 && wrong.slice(waits).every((s) => s === 429), `ten wrong keys are told no, then it waits: ${wrong.join(' ')}`);
  check((await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${ZEUS}`, 'x-portal-caller': 'someone-else' } })).status === 429, 'a caller cannot name itself to start over: the header it sends is replaced');
} catch (err) {
  failures += 1;
  console.error(err);
} finally {
  await stop(dev);
  model.close();
  guestModel.close();
  if (before) writeFileSync(bundle, before);
  else rmSync(bundle, { force: true });
  rmSync(state, { recursive: true, force: true });
  rmSync(join(here, '.wrangler'), { recursive: true, force: true });
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
