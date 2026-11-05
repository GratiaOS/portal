import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { promisify } from 'node:util';
import { RoomStore, nodeSqlite, parseConfig } from '../dist/index.js';

const run = promisify(execFile);
const script = new URL('../dist/gaps.js', import.meta.url).pathname;

function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'room-gaps-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const raw = {
    participants: [{ kind: 'human', alias: 'Zeus', token: 'r'.repeat(24) }, { kind: 'companion', alias: 'Nova' }],
    rooms: [{ id: 'olympus', title: 'Olympus' }],
  };
  const config = join(dir, 'portal.local.json');
  writeFileSync(config, JSON.stringify(raw));
  return { dir, config, db: parseConfig(raw, dir).dbPath };
}

test('the list for whoever keeps the knowledge: what was asked, how often, why, where', async (t) => {
  const { config, db } = setup(t);
  assert.match((await run(process.execPath, [script, config])).stdout, /no database at .* yet, so nothing has been asked/);

  mkdirSync(dirname(db), { recursive: true }); // the room makes this folder when it starts
  const store = new RoomStore(nodeSqlite(db));
  store.syncParticipants([{ kind: 'human', alias: 'Zeus' }, { kind: 'companion', alias: 'Nova' }]);
  store.syncConversations([{ id: 'olympus', title: 'Olympus' }]);
  assert.match((await run(process.execPath, [script, config])).stdout, /Every question Nova was asked was answered/);

  store.recordGap({ conversationId: 'olympus', question: 'Putem sări pasul cu Styx?', why: 'model_found_nothing' });
  store.recordGap({ conversationId: 'olympus', question: 'putem sări pasul cu styx?', why: 'model_found_nothing' });
  store.recordGap({ conversationId: 'olympus', question: 'Cât durează Titanomahia?', why: 'figures_unverified', sources: ['olympus/titanomachy.md'] });
  store.close();

  const { stdout } = await run(process.execPath, [script, config]);
  assert.match(stdout, /^# What the knowledge did not answer\n/);
  assert.match(stdout, /- 2× putem sări pasul cu styx\?\n  not in the knowledge; #olympus, \d{4}-\d{2}-\d{2}\n/);
  assert.match(stdout, /- Cât durează Titanomahia\?\n  figures that are in none of the sources \(cited: olympus\/titanomachy\.md\); #olympus/);
  assert.equal(/Zeus/.test(stdout), false);
});

test('a missing config is said, not guessed at', async (t) => {
  const { dir } = setup(t);
  await assert.rejects(run(process.execPath, [script, join(dir, 'missing.json')]), (err) => err.code === 1 && /cannot read/.test(err.stderr));
});
