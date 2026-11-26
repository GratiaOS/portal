// What `main` has done lately, read from git when asked: nothing about it is written in SIGNAL.md. SIGNAL.md keeps the intention (where we are, what is
// next, what is open); the facts (which pull requests merged, and when) are in git, and are told here, so they cannot go stale. It fetches `main` first
// and says when it could not. It exits 0 always: a signal is told, never a gate.
//   pnpm signal          the last 8 merges, and how far main has moved since SIGNAL.md was last changed
//   pnpm signal 20       the last 20
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SEP = '\u001f';

/** The merges of a `git log --first-parent --merges --format=%h<SEP>%cs<SEP>%s<SEP>%b<SEP>` output, as `{ sha, date, number, title }`. */
export function parseMerges(raw) {
  return raw
    .split('\u001e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, date, subject, body = ''] = entry.split(SEP);
      const number = /#(\d+)/.exec(subject)?.[1];
      const title = body.split('\n').find((line) => line.trim())?.trim() ?? subject;
      return { sha, date, number, title };
    });
}

/** What to say: the recent merges, one a line, and where the signal stands against them. `since` is how many merges left SIGNAL.md alone since it last changed. */
export function report({ merges, signalDate, since, today, fetched = true }) {
  const unsure = fetched ? '' : ' (from what this clone already has: main could not be fetched)';
  const lines = [`main, lately${unsure}:`];
  for (const m of merges) lines.push(`  ${m.date}  ${m.number ? `#${m.number}`.padEnd(5) : '     '} ${m.title}`);
  if (!merges.length) lines.push('  (no merges found)');
  if (signalDate === undefined) {
    lines.push('', 'SIGNAL.md: its last change is not known here (git history missing?).');
  } else {
    const days = Math.round((Date.parse(today) - Date.parse(signalDate)) / 86_400_000);
    const age = `${days} day${days === 1 ? '' : 's'} ago`;
    lines.push(
      '',
      since === 0
        ? `SIGNAL.md was last changed ${signalDate} (${age}); no pull request has merged since without it.`
        : `SIGNAL.md was last changed ${signalDate} (${age}); ${since} pull request${since === 1 ? '' : 's'} merged since that left it alone. Read them: if the direction moved, say so there.`,
    );
  }
  return lines.join('\n');
}

/**
 * Whether a merged pull request, by the files it changed, counts against the signal. One that touched SIGNAL.md has said what it had to say; one that left
 * it alone counts only as news, because the signal asks to change when the direction changes, not at every merge.
 */
export function countsAgainst(files) {
  const changed = files.filter(Boolean);
  return changed.length > 0 && !changed.includes('SIGNAL.md');
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** Brings what main has gained, if it can be reached: without it, what is told is only what this clone already knows. */
function refresh() {
  try {
    execFileSync('git', ['fetch', '--quiet', 'origin', 'main'], { stdio: 'ignore', timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

const ref = () => ['origin/main', 'main', 'HEAD'].find((r) => { try { git('rev-parse', '--verify', '--quiet', r); return true; } catch { return false; } });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const count = Number.parseInt(process.argv[2] ?? '', 10) || 8;
  const fetched = refresh();
  const where = ref();
  let merges = [];
  let signalDate;
  let since;
  if (where) {
    merges = parseMerges(git('log', '--first-parent', '--merges', `-${count}`, `--format=%h${SEP}%cs${SEP}%s${SEP}%b\u001e`, where));
    const last = git('log', '-1', '--format=%H %cs', where, '--', 'SIGNAL.md');
    if (last) {
      const [sha, date] = last.split(' ');
      signalDate = date;
      since = git('rev-list', '--first-parent', '--merges', `${sha}..${where}`)
        .split('\n')
        .filter(Boolean)
        .filter((merge) => countsAgainst(git('diff', '--name-only', `${merge}^1`, merge).split('\n'))).length;
    }
  }
  console.log(report({ merges, signalDate, since, today: new Date().toISOString().slice(0, 10), fetched }));
}
