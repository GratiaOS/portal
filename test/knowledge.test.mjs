import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { KnowledgeBase, canvasToText } from '../dist/index.js';

function folder(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'room-knowledge-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) put(dir, path, content);
  return dir;
}

function put(dir, path, content, secondsFromNow = 0) {
  const full = join(dir, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  const when = new Date(Date.now() + secondsFromNow * 1000);
  utimesSync(full, when, when); // a clock that moves, whatever the filesystem's resolution
}

test('the markdown of a folder is read whole, sorted, each file under its own header', (t) => {
  const dir = folder(t, {
    'b/second.md': 'Second.\n',
    'a/first.md': '  First.  ',
    'top.md': 'Top.',
    'notes.txt': 'not markdown',
    '.hidden/secret.md': 'not for the prompt',
    'node_modules/pkg/readme.md': 'not either',
  });
  const knowledge = new KnowledgeBase(dir);

  assert.deepEqual([...knowledge.files.keys()], ['a/first.md', 'b/second.md', 'top.md']);
  assert.equal(knowledge.text, '### FILE: a/first.md\nFirst.\n\n### FILE: b/second.md\nSecond.\n\n### FILE: top.md\nTop.');
  assert.equal(knowledge.bytes, '  First.  '.length + 'Second.\n'.length + 'Top.'.length);
});

test('refresh picks up what changed and says whether anything did', (t) => {
  const dir = folder(t, { 'a.md': 'one', 'b.md': 'two' });
  const knowledge = new KnowledgeBase(dir);
  const before = knowledge.text;

  assert.equal(knowledge.refresh(), false);
  assert.equal(knowledge.text, before); // the same text, so a server that caches the prompt keeps its cache

  put(dir, 'a.md', 'one, changed', 10);
  assert.equal(knowledge.refresh(), true);
  assert.match(knowledge.text, /one, changed/);

  put(dir, 'c/new.md', 'three', 10);
  assert.equal(knowledge.refresh(), true);
  assert.deepEqual([...knowledge.files.keys()], ['a.md', 'b.md', 'c/new.md']);

  unlinkSync(join(dir, 'b.md'));
  assert.equal(knowledge.refresh(), true);
  assert.deepEqual([...knowledge.files.keys()], ['a.md', 'c/new.md']);
});

test('a folder that is too big for a prompt, or empty, is refused', (t) => {
  const big = folder(t, { 'a.md': 'x'.repeat(6000), 'b.md': 'y'.repeat(6000) });
  assert.throws(() => new KnowledgeBase(big, 10_000), /12 KB, more than the 10 KB that fit in a prompt; it needs retrieval/);
  assert.doesNotThrow(() => new KnowledgeBase(big, 20_000));

  assert.throws(() => new KnowledgeBase(folder(t, { 'notes.txt': 'x' })), /no \.md or \.canvas files/);
  assert.throws(() => new KnowledgeBase(join(tmpdir(), 'room-no-such-folder-' + Date.now())), /ENOENT/);
});

test('a folder that disappears later does not take the knowledge with it', (t) => {
  const dir = folder(t, { 'a.md': 'one' });
  const knowledge = new KnowledgeBase(dir);
  rmSync(dir, { recursive: true, force: true });

  const log = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    assert.equal(knowledge.refresh(), false);
  } finally {
    console.error = log;
  }
  assert.equal(logged.length, 1);
  assert.match(knowledge.text, /one/);
});

const CANVAS = {
  nodes: [
    { id: 'a', type: 'text', text: '# **Register**\nEmail and phone', x: 0, y: 0, width: 100, height: 50 },
    { id: 'b', type: 'text', text: 'Approve', x: 10, y: 10, width: 20, height: 20 },
    { id: 'c', type: 'text', text: 'Approve', x: 500, y: 500, width: 20, height: 20 },
    { id: 'g', type: 'group', label: 'Signup', x: -10, y: -10, width: 200, height: 200 },
    { id: 'f', type: 'file', file: 'olympus/overview.md', x: 1000, y: 0, width: 10, height: 10 },
    { id: 'l', type: 'link', url: 'https://example.com' },
    { id: 'e', type: 'text', text: '' },
  ],
  edges: [
    { id: '1', fromNode: 'a', toNode: 'b', label: 'if **ok**' },
    { id: '2', fromNode: 'b', toNode: 'c' },
    { id: '3', fromNode: 'a', toNode: 'nowhere' },
  ],
};

test('a canvas is read as its boxes, the groups they sit in, and the arrows between them', () => {
  const text = canvasToText(JSON.stringify(CANVAS));
  const lines = text.split('\n');

  assert.match(lines[0], /^A flow diagram, as text/);
  for (const line of ['- Register: Email and phone', '- Approve', '- Approve (2)', '- olympus/overview.md (file)', '- https://example.com (link)', '- e']) {
    assert.ok(lines.includes(line), `missing ${line}`);
  }
  assert.ok(lines.includes('- Signup: Register, Approve')); // the second Approve is outside the group
  assert.ok(lines.includes('- Register -> Approve (if ok)'));
  assert.ok(lines.includes('- Approve -> Approve (2)'));
  assert.equal(lines.filter((l) => l.includes('->')).length, 2); // an arrow to nowhere is dropped
  assert.equal(text.includes('x":'), false); // no coordinates, no JSON
});

test('what is not a canvas is not read as one', () => {
  for (const source of ['not json', '{"nodes": 5}', '[]', 'null', '{}', '"canvas"']) assert.equal(canvasToText(source), null, source);
  assert.match(canvasToText('{"nodes": []}'), /^A flow diagram/); // an empty one is still a canvas
});

test('canvases sit in the knowledge next to the markdown, under their own paths, and a broken one is left out', (t) => {
  const dir = folder(t, { 'a.md': 'Text.', 'flows/olympus.canvas': JSON.stringify(CANVAS), 'flows/broken.canvas': '{ oops' });
  const log = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args.join(' '));
  let knowledge;
  try {
    knowledge = new KnowledgeBase(dir);
  } finally {
    console.error = log;
  }

  assert.deepEqual([...knowledge.files.keys()], ['a.md', 'flows/olympus.canvas']);
  assert.match(knowledge.text, /### FILE: flows\/olympus\.canvas\nA flow diagram, as text/);
  assert.equal(logged.length, 1);
  assert.match(logged[0], /skipping flows\/broken\.canvas/);

  // a change to a flow is picked up like a change to a page
  put(dir, 'flows/olympus.canvas', JSON.stringify({ nodes: [{ id: 'x', type: 'text', text: 'Only step' }] }), 10);
  assert.equal(knowledge.refresh(), true);
  assert.match(knowledge.text, /- Only step/);
  assert.equal(knowledge.text.includes('Register'), false);
});

test('a folder of only broken canvases is empty, not silently fine', (t) => {
  const log = console.error;
  console.error = () => undefined;
  try {
    assert.throws(() => new KnowledgeBase(folder(t, { 'a.canvas': 'nope' })), /no readable \.md or \.canvas files/);
  } finally {
    console.error = log;
  }
});

test('what is excluded is never read, whatever the case, and a folder takes everything under it', (t) => {
  const dir = folder(t, {
    'index.md': 'Public.\n',
    'glossary.md': 'Glossary.\n',
    'partners/interfaces/partner.md': 'Secret endpoint.\n',
    'partners/interfaces/deep/flow.canvas': JSON.stringify({ nodes: [{ id: 'a', type: 'text', text: 'Secret flow', x: 0, y: 0, width: 10, height: 10 }], edges: [] }),
    'partners/overview.md': 'Overview.\n',
    'Notes/Private.md': 'Private.\n',
  });
  const knowledge = new KnowledgeBase(dir, undefined, { exclude: ['Partners/Interfaces/', './notes/private.md', '  '] });
  assert.deepEqual([...knowledge.files.keys()], ['glossary.md', 'index.md', 'partners/overview.md']);
  assert.equal(/Secret|Private/.test(knowledge.text), false);
});

test('an excluded folder that appears later stays out, and nothing else changes', (t) => {
  const dir = folder(t, { 'index.md': 'Public.\n' });
  const knowledge = new KnowledgeBase(dir, undefined, { exclude: ['partners/interfaces'] });
  put(dir, 'partners/interfaces/partner.md', 'Secret endpoint.\n', 5);
  assert.equal(knowledge.refresh(), false); // nothing new that counts
  assert.deepEqual([...knowledge.files.keys()], ['index.md']);
  put(dir, 'extra.md', 'More.\n', 10);
  assert.equal(knowledge.refresh(), true);
  assert.deepEqual([...knowledge.files.keys()], ['extra.md', 'index.md']);
});

test('the room can say what is read, and what is kept from her, including a path that is not there', (t) => {
  const dir = folder(t, { 'index.md': 'A.\n', 'glossary.md': 'B.\n', 'reference/a.md': 'C.\n', 'reference/b.md': 'D.\n', 'altars/x.md': 'E.\n', 'hidden/z.md': 'F.\n' });
  const knowledge = new KnowledgeBase(dir, undefined, { exclude: ['hidden', 'partners/interfaces'] });
  assert.deepEqual(knowledge.summary(), [
    { folder: '', files: 2 },
    { folder: 'altars', files: 1 },
    { folder: 'reference', files: 2 },
  ]);
  assert.deepEqual(knowledge.describe(), ['reads 5 files: 2 at the top, altars (1), reference (2)', 'leaves out: hidden, partners/interfaces (nothing there now)']);
  assert.deepEqual(new KnowledgeBase(dir).describe().length, 1); // nothing to say about what is not excluded
});

test('a folder that shows up in the knowledge later is announced once, not the first look and not a file at the top', (t) => {
  const dir = folder(t, { 'index.md': 'A.\n', 'reference/a.md': 'B.\n' });
  const told = [];
  const knowledge = new KnowledgeBase(dir, undefined, { onNewFolder: (name, files) => told.push([name, files]) });
  assert.deepEqual(told, []); // what was there at the start is not news
  put(dir, 'top.md', 'C.\n', 5);
  put(dir, 'reference/b.md', 'D.\n', 5);
  knowledge.refresh();
  assert.deepEqual(told, []); // a file at the top, and a file in a folder already read
  put(dir, 'interfaces/p.md', 'E.\n', 10);
  put(dir, 'interfaces/q.md', 'F.\n', 10);
  knowledge.refresh();
  assert.deepEqual(told, [['interfaces', 2]]);
  put(dir, 'interfaces/r.md', 'G.\n', 15);
  knowledge.refresh();
  assert.deepEqual(told, [['interfaces', 2]]); // already known
});

test('an exclusion meets the path whatever way it was written: dot parts, doubled slashes, a composed or a decomposed letter', (t) => {
  const dir = folder(t, {
    'index.md': 'Public.\n',
    'private/contract.md': 'Secret contract.\n',
    'private/other.md': 'Secret other.\n',
    'S\u0326ecret/note.md': 'Secret note.\n', // a name stored decomposed (S and a combining comma below)
    'Contracte/ocupate.md': 'Secret too.\n',
  });
  const knowledge = new KnowledgeBase(dir, undefined, { exclude: ['private/./contract.md', 'private//other.md', '\u0218ecret', './contracte/'] }); // the third is the same name, composed (\u0218)
  assert.deepEqual([...knowledge.files.keys()], ['index.md']);
  assert.equal(/Secret/.test(knowledge.text), false);
});
