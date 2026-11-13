// A portal to try things on, from a fresh clone, with nothing to set up: `pnpm dev` (this machine only) or `pnpm dev:lan` (the people
// on your network too). The room lives in memory: the tokens are made at the start and printed, nothing is written to disk, and a
// restart is a new, empty room. For a portal that is kept, see INSTALL.md.
//
//   node scripts/dev.mjs [--lan] [--port 3100] [--people Zeus,Hera,Athena] [--no-build]
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);

const lan = flag('--lan');
const port = Number(value('--port', 3100));
const people = String(value('--people', 'Zeus,Hera,Athena')).split(',').map((s) => s.trim()).filter(Boolean);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('--port must be a number from 0 to 65535');
if (!people.length) throw new Error('--people needs at least one name');

// the page is built once, when it is not there yet; without it the portal still runs, with its API only
const page = join(root, 'ui', 'dist');
if (!existsSync(join(page, 'index.html')) && !flag('--no-build')) {
  console.log('building the page once (pnpm --filter portal-ui build)…');
  const built = spawnSync('pnpm', ['--filter', 'portal-ui', 'build'], { cwd: root, stdio: 'inherit' });
  if (built.status !== 0) console.warn('the page could not be built; the portal runs with its API only');
}

const { VERSION, parseConfig, startRoom } = await import(join(root, 'dist', 'index.js'));

const tokens = Object.fromEntries(people.map((name) => [name, randomBytes(24).toString('base64url')]));
const config = parseConfig(
  {
    name: 'El portal (try it)',
    port,
    host: lan ? '0.0.0.0' : '127.0.0.1',
    dbPath: ':memory:',
    participants: people.map((alias) => ({ kind: 'human', alias, token: tokens[alias] })),
    rooms: [
      { id: 'general', title: 'General' },
      { id: 'guests', title: 'Guests', kind: 'guest' },
    ],
    // the door for visitors is open, so that anyone on the network can walk in at /guest, with no key
    guests: { room: 'guests' },
    ...(existsSync(join(page, 'index.html')) ? { staticDir: page } : {}),
    ...(existsSync(join(root, 'skins')) ? { skinsDir: join(root, 'skins') } : {}),
  },
  root,
);
const room = await startRoom(config);

const lanAddresses = Object.values(networkInterfaces())
  .flat()
  .filter((n) => n && n.family === 'IPv4' && !n.internal)
  .map((n) => n.address);

const out = [];
out.push('', `🗺️  El portal ${VERSION}`, '');
out.push(`   This machine   http://127.0.0.1:${room.port}/`);
if (lan) {
  for (const ip of lanAddresses) out.push(`   Your network   http://${ip}:${room.port}/   (and /guest, to walk in with no key)`);
  if (!lanAddresses.length) out.push('   Your network   no address found: is this machine on one?');
} else {
  out.push('   (only this machine; `pnpm dev:lan` opens it to your network)');
}
out.push('', '   A key for each person (made now, kept nowhere, new at every start):');
for (const name of people) out.push(`     ${name.padEnd(12)} ${tokens[name]}`);
out.push('', '   In memory: stop it and the room, the keys and what was said are gone.');
if (lan) out.push('   On a network the keys travel in plain HTTP: only on one you trust.');
out.push('   No companion here: she needs a model (see INSTALL.md, "Nova").', '   Ctrl-C to stop.', '');
console.log(out.join('\n'));

const stop = async () => {
  await room.close();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
