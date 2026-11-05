import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { promisify } from 'node:util';

const run = promisify(execFile);

test('the demo plays the scene in a real room and its own claims hold', async () => {
  const { stdout } = await run(process.execPath, [new URL('../scripts/demo.mjs', import.meta.url).pathname], {
    env: { ...process.env, PORTAL_DEMO_PAUSE_MS: '0' },
    timeout: 20_000,
  });

  for (const line of [
    /#general <Zeus> Neața tuturor/,
    /#general <Poseidon> Salut @zeus/,
    /#olympus <Athena> @nova putem sari pasul cu Styx din Olympus\?/,
    /#olympus <Nova> @athena nu merge, e parte din jurământ, mai exact cel pe Styx/,
    /\* Eirene is offline/,
    /✔ all 4 connections saw the same 5 turns/,
  ]) {
    assert.match(stdout, line);
  }
  assert.equal(stdout.includes('✖'), false);
});
