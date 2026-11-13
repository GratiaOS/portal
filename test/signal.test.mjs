import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countsAgainst, report } from '../scripts/signal-check.mjs';

const TEXT = '**Verified:** 2026-11-09, against `main@0f7dea3`. More.';

test('a signal says how far main has moved since its stamp, and how old the stamp is', () => {
  assert.match(report(TEXT, 0, '2026-11-12'), /is current/);
  assert.match(report(TEXT, 1, '2026-11-10'), /1 pull request merged since 0f7dea3.*1 day ago/);
  assert.match(report(TEXT, 4, '2026-11-16'), /4 pull requests merged since 0f7dea3.*7 days ago/);
});

test('a stamp that cannot be checked, or none at all, is said and never an error', () => {
  assert.match(report(TEXT, undefined, '2026-11-12'), /not known/);
  assert.match(report('no stamp here', 3, '2026-11-12'), /says nothing of how current/);
});

test('when main could not be fetched, a count is said to be from what the clone has, whatever it finds', () => {
  assert.match(report(TEXT, 0, '2026-11-12', false), /is current.*could not be fetched/);
  assert.match(report(TEXT, 2, '2026-11-12', false), /is behind.*could not be fetched/);
  assert.doesNotMatch(report(TEXT, 0, '2026-11-12', true), /fetched/);
});

test('a pull request that changed the signal has kept it true: only one that left SIGNAL.md alone counts against the stamp', () => {
  assert.equal(countsAgainst(['src/app.ts', 'docs/x.md']), true);
  assert.equal(countsAgainst(['SIGNAL.md']), false); // it only moved the stamp
  assert.equal(countsAgainst(['SIGNAL.md', 'docs/releasing.md']), false); // it changed something and said so: the signal is not left one behind by its own pull request
  assert.equal(countsAgainst(['CHANGELOG.md', 'SIGNAL.md', 'package.json']), false);
  assert.equal(countsAgainst(['', '']), false); // a merge that changed nothing is nothing
  assert.equal(countsAgainst([]), false);
});
