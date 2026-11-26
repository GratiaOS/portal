import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countsAgainst, parseMerges, report } from '../scripts/signal-check.mjs';

const SEP = '\u001f';
const RAW =
  `49ecd42${SEP}2026-11-26${SEP}Merge pull request #106 from GratiaOS/docs/x${SEP}docs: the glossary names the human\n${'\u001e'}\n` +
  `0aa11bb${SEP}2026-11-25${SEP}Merge branch 'main' into y${SEP}${'\u001e'}`;

test('the merges are read from the log: the number, the date and the title of the pull request', () => {
  const [first, second] = parseMerges(RAW);
  assert.deepEqual(first, { sha: '49ecd42', date: '2026-11-26', number: '106', title: 'docs: the glossary names the human' });
  assert.equal(second.number, undefined);
  assert.equal(second.title, "Merge branch 'main' into y"); // no body: the subject says what there is
});

test('the report lists the merges and says where the signal stands, and how old it is', () => {
  const merges = parseMerges(RAW);
  assert.match(report({ merges, signalDate: '2026-11-23', since: 0, today: '2026-11-26' }), /#106 +docs: the glossary names the human/);
  assert.match(report({ merges, signalDate: '2026-11-23', since: 0, today: '2026-11-26' }), /3 days ago.*no pull request has merged since/);
  assert.match(report({ merges, signalDate: '2026-11-25', since: 1, today: '2026-11-26' }), /1 day ago\); 1 pull request merged since/);
  assert.match(report({ merges, signalDate: '2026-11-20', since: 4, today: '2026-11-26' }), /4 pull requests merged since/);
});

test('what cannot be known is said and never an error', () => {
  assert.match(report({ merges: [], signalDate: undefined, since: undefined, today: '2026-11-26' }), /no merges found[\s\S]*not known/);
  assert.match(report({ merges: [], signalDate: '2026-11-23', since: 0, today: '2026-11-26', fetched: false }), /could not be fetched/);
  assert.doesNotMatch(report({ merges: [], signalDate: '2026-11-23', since: 0, today: '2026-11-26' }), /fetched/);
});

test('only a pull request that left SIGNAL.md alone counts as news for the signal', () => {
  assert.equal(countsAgainst(['src/app.ts', 'docs/x.md']), true);
  assert.equal(countsAgainst(['SIGNAL.md']), false);
  assert.equal(countsAgainst(['SIGNAL.md', 'docs/releasing.md']), false);
  assert.equal(countsAgainst(['', '']), false);
  assert.equal(countsAgainst([]), false);
});
