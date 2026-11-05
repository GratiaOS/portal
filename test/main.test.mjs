import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const main = fileURLToPath(new URL('../dist/main.js', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('--version says which room this is, and needs no config to say it', () => {
  const out = execFileSync(process.execPath, [main, '--version'], { encoding: 'utf8', env: { ...process.env, PORTAL_CONFIG: '/nowhere/room.json' } });
  assert.equal(out, `portal ${version}\n`);
});
