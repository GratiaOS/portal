import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkLinks, checkTraces } from '../scripts/verify-traces.mjs';

const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

const block = (path, commit, { without = '' } = {}) =>
  [
    '/**',
    ' * 🗿 trace',
    ' * Name from:  Something',
    ` * Path:       ${path} @ ${commit}`,
    ' * Same idea:  the idea',
    ' * Different:  the difference',
    ' * Not copied: written new.',
    ' */',
    'export {};',
  ]
    .filter((line) => !without || !line.includes(without))
    .join('\n');

function repo(t) {
  const top = mkdtempSync(join(tmpdir(), 'room-traces-'));
  t.after(() => rmSync(top, { recursive: true, force: true }));
  git(top, 'init', '-q');
  mkdirSync(join(top, 'elsewhere'), { recursive: true });
  writeFileSync(join(top, 'elsewhere', 'Thing.tsx'), 'export const Thing = 1;');
  git(top, 'add', '.');
  git(top, 'commit', '-q', '-m', 'first');
  const commit = git(top, 'rev-parse', '--short', 'HEAD');
  const room = join(top, 'apps', 'room');
  mkdirSync(join(room, 'src'), { recursive: true });
  return { top, room, commit };
}

const put = (room, name, text) => {
  mkdirSync(dirname(join(room, name)), { recursive: true });
  writeFileSync(join(room, name), text);
};

test('the traces of the room itself are whole, and every place they name is a permalink into a public repository', () => {
  const result = checkTraces(join(dirname(fileURLToPath(import.meta.url)), '..'));
  assert.deepEqual(result.problems, []);
  assert.equal(result.skipped, undefined); // nothing points into a history that a copy of the portal would not have
  assert.ok(result.traces >= 8, `only ${result.traces} traces`);
  assert.ok(result.links.length >= 20, `only ${result.links.length} links`);
  for (const link of result.links) {
    assert.equal(link.owner, 'GratiaOS', link.url);
    assert.match(link.commit, /^[0-9a-f]{40}$/, link.url); // a whole commit, which no later push can make ambiguous
  }
  // whether each link still answers is asked over the network by `pnpm --filter portal traces`, not here
});

test('a permalink is asked once, a place that is gone is named, and a network that cannot be reached is said apart', async () => {
  const link = (path) => ({ name: 'src/a.ts', url: '', owner: 'GratiaOS', repo: 'firegate', commit: 'e4f7912db5f4314acd3d26ab80096f92a7258e3f', path });
  const asked = [];
  const fake = async (url) => {
    asked.push(url);
    if (url.endsWith('Gone.tsx')) return { ok: false, status: 404 };
    if (url.endsWith('Far.tsx')) throw new Error('offline');
    return { ok: true, status: 200 };
  };
  const { problems, unreachable } = await checkLinks([link('There.tsx'), link('There.tsx'), link('Gone.tsx'), link('Far.tsx')], fake);
  assert.deepEqual(problems, ['src/a.ts: firegate/Gone.tsx is not at e4f7912']);
  assert.equal(unreachable, 1);
  assert.equal(asked.filter((u) => u.endsWith('There.tsx')).length, 1);
  assert.ok(asked.every((u) => u.startsWith('https://raw.githubusercontent.com/GratiaOS/firegate/e4f7912db5f4314acd3d26ab80096f92a7258e3f/')));
});

test('a network that never answers is given up on after the timeout, and counted as not reached', async () => {
  const link = { name: 'src/a.ts', url: '', owner: 'GratiaOS', repo: 'm3', commit: 'c76a3cba25335e122434990b40dd9656f495a0a9', path: 'Whisper.md' };
  // a fetch that hangs until it is told to stop, as a firewalled connection does
  const hangs = (url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  const started = Date.now();
  const { problems, unreachable } = await checkLinks([link, { ...link, path: 'docs/privacy.md' }], hangs, { timeoutMs: 50 });
  assert.deepEqual(problems, []);
  assert.equal(unreachable, 2);
  assert.ok(Date.now() - started < 1000, 'the two places are asked at the same time, not one after the other');
});

test('a trace that points at a place and a commit that exist is fine', (t) => {
  const { room, commit } = repo(t);
  put(room, 'src/a.ts', block('elsewhere/Thing.tsx', commit));
  put(room, 'ui/src/b.tsx', block('elsewhere/Thing.tsx', commit));
  put(room, 'TRACES.md', `# 🗿 Traces\n\n| a | \`elsewhere/Thing.tsx @ ${commit}\` |\n`);
  const result = checkTraces(room);
  assert.deepEqual(result.problems, []);
  assert.equal(result.traces, 3);
  assert.equal(result.pointers, 3);
});

test('a place that is not there, or a commit that is not known, is named', (t) => {
  const { room, commit } = repo(t);
  put(room, 'src/gone.ts', block('elsewhere/Moved.tsx', commit));
  put(room, 'src/early.ts', block('elsewhere/Thing.tsx', 'deadbeef'));
  const { problems } = checkTraces(room);
  assert.deepEqual(problems.sort(), [`src/early.ts: elsewhere/Thing.tsx is not at deadbeef`, `src/gone.ts: elsewhere/Moved.tsx is not at ${commit}`].sort());
});

test('a trace must say where from, what is alike, and that nothing was copied', (t) => {
  const { room, commit } = repo(t);
  put(room, 'src/no-idea.ts', block('elsewhere/Thing.tsx', commit, { without: 'Same idea:' }));
  put(room, 'src/no-licence.ts', block('elsewhere/Thing.tsx', commit, { without: 'Not copied:' }));
  put(room, 'src/stray.ts', '// 🗿 it was like this before\nexport {};\n');
  const { problems } = checkTraces(room);
  assert.deepEqual(problems.sort(), ['src/no-idea.ts: a trace has no "Same idea:"', 'src/no-licence.ts: a trace has no "Not copied:"', 'src/stray.ts: has a 🗿 but not in a "🗿 trace" comment block'].sort());
});

test('without a repository a pointer into it cannot be checked, and that is said, not failed; the shape still is', () => {
  const dir = mkdtempSync(join(tmpdir(), 'room-no-git-'));
  try {
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'src', 'a.ts'), block('elsewhere/Thing.tsx', 'abc1234'));
    writeFileSync(join(dir, 'src', 'b.ts'), block('elsewhere/Thing.tsx', 'abc1234', { without: 'Same idea:' }));
    const result = checkTraces(dir);
    assert.match(result.skipped, /not a git checkout, so 2 pointer/);
    assert.deepEqual(result.problems, ['src/b.ts: a trace has no "Same idea:"']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
