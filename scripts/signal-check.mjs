// How far `main` has moved since SIGNAL.md was last verified (it fetches `main` first, and says when it could not). It says so and exits 0: a signal that is behind is told, never blocked.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const STAMP = /Verified:\*{0,2}\s*(\d{4}-\d{2}-\d{2}),?\s*against\s*`?main@([0-9a-f]{7,40})`?/;

/** What to say, from the text of SIGNAL.md, the number of merged pull requests since its stamp, and today's date (`YYYY-MM-DD`). */
export function report(text, mergesSince, today, fetched = true) {
  const found = STAMP.exec(text);
  if (!found) return 'SIGNAL.md has no "Verified: <date>, against main@<sha>" line: it says nothing of how current it is.';
  const [, date, sha] = found;
  const days = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
  if (mergesSince === undefined) return `SIGNAL.md was verified on ${date} against ${sha}; that commit is not here, so how far main has moved is not known (git fetch?).`;
  const unsure = fetched ? '' : ' (counted from what this clone already has: main could not be fetched)';
  if (mergesSince === 0) return `SIGNAL.md is current: verified ${date}, and nothing has been merged since ${sha}${unsure}.`;
  return `SIGNAL.md is behind: ${mergesSince} pull request${mergesSince === 1 ? '' : 's'} merged since ${sha} (verified ${date}, ${days} day${days === 1 ? '' : 's'} ago)${unsure}. Read them, then move the stamp.`;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** Brings what main has gained, if it can be reached: without it, what is counted is only what this clone already knows. */
function refresh() {
  try {
    execFileSync('git', ['fetch', '--quiet', 'origin', 'main'], { stdio: 'ignore', timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Whether a merged pull request, by the files it changed, counts against the stamp. One that touched SIGNAL.md has kept it true itself: whoever changes
 * something and changes the signal with it has done what the signal asks, and counting that pull request would put every signal one behind for ever (the stamp
 * cannot name the merge commit of the pull request that carries it). One that left SIGNAL.md alone counts, until the signal says something about it.
 */
export function countsAgainst(files) {
  const changed = files.filter(Boolean);
  return changed.length > 0 && !changed.includes('SIGNAL.md');
}

/** The pull requests merged into main since the stamp (not a merge of main into a branch) that left SIGNAL.md alone. */
function mergesSince(sha) {
  for (const ref of ['origin/main', 'main', 'HEAD']) {
    try {
      const merges = git('rev-list', '--first-parent', '--merges', `${sha}..${ref}`).split('\n').filter(Boolean);
      return merges.filter((merge) => countsAgainst(git('diff', '--name-only', `${merge}^1`, merge).split('\n'))).length;
    } catch {
      /* the next place to look */
    }
  }
  return undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const text = readFileSync(new URL('../SIGNAL.md', import.meta.url), 'utf8');
  const sha = STAMP.exec(text)?.[2];
  const fetched = refresh();
  console.log(report(text, sha ? mergesSince(sha) : undefined, new Date().toISOString().slice(0, 10), fetched));
}
