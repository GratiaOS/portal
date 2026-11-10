import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KnowledgeBase, parseConfig } from '../dist/index.js';

// The starter folder of documents for visitors: about the portal as a program, the same for anyone who runs one.
const FOLDER = new URL('../guest-docs/', import.meta.url).pathname;

function read() {
  const base = new KnowledgeBase(FOLDER);
  base.refresh();
  return base;
}

test('the starter folder holds a few short documents, and nothing of a team, a company or a machine', () => {
  const { files, text } = read();
  assert.deepEqual([...files.keys()].sort(), ['about-nova.md', 'for-visitors.md', 'run-your-own.md', 'what-a-portal-keeps.md', 'what-is-el-portal.md']);
  for (const [path, content] of files) assert.ok(content.trim().length > 200 && content.length < 4000, `${path} is short and not empty`);
  assert.ok(text.length < 12_000, 'all of it is small enough to go in every prompt');
  for (const word of ['Zeus', 'Hera', 'firegate', 'gratiaos.dev', 'Idalion', '/Users/', 'localhost', 'password:']) assert.ok(!text.includes(word), `the folder names "${word}"`);
});

test('the figures the documents give are the defaults the portal has, so they cannot drift apart', () => {
  const config = parseConfig(
    { participants: [{ kind: 'human', alias: 'Zeus', token: 'z'.repeat(24) }], rooms: [{ id: 'g', title: 'G', kind: 'guest' }], guests: { room: 'g' }, dbPath: ':memory:' },
    '/base',
  );
  const { files } = read();
  const said = (name) => files.get(name);
  assert.match(said('what-a-portal-keeps.md'), new RegExp(`last ${config.retention.days} days or its last ${config.retention.messages} messages`));
  assert.match(said('what-a-portal-keeps.md'), new RegExp(`${config.guests.forgetAfterMinutes} minutes after the last visit`));
  assert.match(said('what-a-portal-keeps.md'), new RegExp(`lasts ${config.guests.minutes} minutes by default`));
  assert.match(said('for-visitors.md'), new RegExp(`${config.guests.trailMinutes} minutes after it was said`));
  assert.match(said('what-a-portal-keeps.md'), new RegExp(`${config.guests.trailMinutes} minutes after it was said`));
  assert.match(said('for-visitors.md'), new RegExp(`By default it lasts ${config.guests.minutes} minutes`));
  assert.match(said('for-visitors.md'), new RegExp(`\\(${config.guests.forgetAfterMinutes} by default\\)`));
  assert.match(said('about-nova.md'), new RegExp(`ask her ${config.guests.nova.questions} questions during a visit, and all visitors together may ask ${config.guests.nova.perHour} in an hour`));
});

test('the documents say the defaults are not what this portal does, and when the visitor room ends', () => {
  const { files } = read();
  assert.match(files.get('what-a-portal-keeps.md'), /do not say how long \*this\* portal keeps/);
  assert.match(files.get('what-a-portal-keeps.md'), /not when someone leaves/);
});

test('the documents never promise that what a visitor writes or asks is hidden from whoever runs the portal, who can read every room', () => {
  const { files } = read();
  for (const [path, content] of files) assert.doesNotMatch(content, /anywhere else the team reads|nobody (else )?can read|only you can|private to you/i, path);
  assert.match(files.get('for-visitors.md'), /Whoever runs the portal can read this room too/);
  assert.match(files.get('about-nova.md'), /by whoever runs the portal, who can read every room/);
});
