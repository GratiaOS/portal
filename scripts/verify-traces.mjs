// Checks the 🗿 traces: every place they point at must exist at the commit they name.
// Run: pnpm --filter portal traces
//
// A trace points at a place in one of two ways. A permalink into a public repository,
// `https://github.com/GratiaOS/firegate/blob/<commit>/packages/ui/src/components/SeedPortal.tsx`, which anyone can open and
// which is checked over the network (without it, that is said and nothing fails). Or a place in this same repository,
// `path @ commit`, checked against its own history with `git cat-file`. Either way the pointers cannot rot unnoticed.

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARK = '🗿';
const POINTER = /([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)\s+@\s+([0-9a-f]{7,40})\b/g;
const LINK = /https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/blob\/([0-9a-f]{7,40})\/([^\s`)|>]+)/g;
const BLOCK = /\/\*\*[\s\S]*?\*\//g;
const REQUIRED = ['Path:', 'Same idea:', 'Not copied:'];

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (/\.(ts|tsx)$/.test(name)) yield path;
  }
}

/**
 * Where traces live: the code of the portal and of its page, and its documents: at the top of the portal (in its own repository,
 * they sit there) and in `repository/` (where they wait in the monorepo). Not the tests and scripts, which talk about traces.
 */
function* places(dir) {
  for (const sub of ['src', join('ui', 'src')]) if (existsSync(join(dir, sub))) yield* walk(join(dir, sub));
  for (const top of [dir, join(dir, 'repository')]) if (existsSync(top)) for (const name of readdirSync(top)) if (name.endsWith('.md')) yield join(top, name);
}

/**
 * Reads every file under `dir` that carries a 🗿, and checks it: the shape of each trace, and every `path @ commit` against
 * this repository's history. The permalinks are only collected, in `links`, for `checkLinks`. `problems` is empty when all is well.
 */
export function checkTraces(dir) {
  let top;
  try {
    top = git(dir, 'rev-parse', '--show-toplevel');
  } catch {
    top = undefined;
  }

  const problems = [];
  const links = [];
  let traces = 0;
  let pointers = 0;
  let unchecked = 0;

  for (const file of places(dir)) {
    const text = readFileSync(file, 'utf8');
    if (!text.includes(MARK)) continue;
    const name = relative(dir, file);

    // a trace in code is a comment block that opens with the mark; each one must say where, what is alike, what is not copied
    const blocks = file.endsWith('.md') ? [] : (text.match(BLOCK) ?? []).filter((b) => b.includes(`${MARK} trace`));
    for (const block of blocks) {
      traces += 1;
      for (const label of REQUIRED) if (!block.includes(label)) problems.push(`${name}: a trace has no "${label}"`);
    }
    if (!file.endsWith('.md') && !blocks.length) problems.push(`${name}: has a ${MARK} but not in a "${MARK} trace" comment block`);
    if (file.endsWith('.md')) traces += 1;

    for (const [, path, commit] of text.matchAll(POINTER)) {
      pointers += 1;
      if (!top) {
        unchecked += 1;
        continue;
      }
      try {
        git(top, 'cat-file', '-e', `${commit}:${path}`);
      } catch {
        problems.push(`${name}: ${path} is not at ${commit}`);
      }
    }
    for (const [url, owner, repo, commit, path] of text.matchAll(LINK)) {
      pointers += 1;
      links.push({ name, url, owner, repo, commit, path });
    }
  }
  const skipped = unchecked ? `not a git checkout, so ${unchecked} pointer(s) into this repository were not checked against its history` : undefined;
  return { traces, pointers, links, problems, ...(skipped ? { skipped } : {}) };
}

/**
 * Asks the public repositories whether each permalink still answers: the file at that commit, as raw text. A place that is
 * not there is a problem; a network that cannot be reached, or does not answer within `timeoutMs`, is not, and is said apart.
 * Each place is asked once, all of them at the same time, so an offline run ends after one timeout. `fetchImpl` is for tests.
 */
export async function checkLinks(links, fetchImpl = fetch, { timeoutMs = 10_000 } = {}) {
  const ask = (raw) =>
    fetchImpl(raw, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) }).then(
      (res) => (res.ok ? 'there' : res.status === 404 ? 'gone' : 'unreachable'),
      () => 'unreachable',
    );
  const rawOf = (link) => `https://raw.githubusercontent.com/${link.owner}/${link.repo}/${link.commit}/${link.path}`;
  const answers = new Map();
  for (const link of links) if (!answers.has(rawOf(link))) answers.set(rawOf(link), ask(rawOf(link)));

  const problems = [];
  let unreachable = 0;
  for (const link of links) {
    const answer = await answers.get(rawOf(link));
    if (answer === 'gone') problems.push(`${link.name}: ${link.repo}/${link.path} is not at ${link.commit.slice(0, 7)}`);
    if (answer === 'unreachable') unreachable += 1;
  }
  return { problems, unreachable };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = checkTraces(join(dirname(fileURLToPath(import.meta.url)), '..'));
  const online = await checkLinks(result.links);
  const problems = [...result.problems, ...online.problems];
  console.log(`traces: ${result.traces} traces, ${result.pointers} pointers (${result.links.length} links to public repositories)`);
  if (result.skipped) console.log(`traces: ${result.skipped}`);
  if (online.unreachable) console.log(`traces: ${online.unreachable} link(s) not checked: GitHub could not be reached`);
  for (const problem of problems) console.error(`  ✖ ${problem}`);
  if (problems.length) process.exit(1);
}
