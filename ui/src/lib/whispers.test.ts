import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stringsFor } from './strings.ts';
import { nextWhisper, whispersFor } from './whispers.ts';

const ro = stringsFor('ro');
const en = stringsFor('en-GB');

test('whispers: the usual line first, then how to call her, then the company\'s questions with her name in front', () => {
  const lines = whispersFor(ro, { companion: 'Nova', examples: ['cine păzește porțile Olimpului?'] });
  assert.equal(lines[0], 'Scrie un mesaj…');
  assert.deepEqual(lines.slice(1, 4), ['Cheam-o pe @Nova ca pe o colegă.', '@Nova, mă ajuți cu ceva?', '@Nova, tu ce părere ai?']);
  assert.equal(lines[4], '@Nova, cine păzește porțile Olimpului?');
  assert.equal(lines.length, 5);
});

test('whispers: in English for those whose language is English; the examples stay as the company wrote them', () => {
  const lines = whispersFor(en, { companion: 'Nova', examples: ['what is ambrosia?'] });
  assert.equal(lines[0], 'Write a message…');
  assert.equal(lines[1], 'Call @Nova like you would a colleague.');
  assert.equal(lines.at(-1), '@Nova, what is ambrosia?');
});

test('whispers: without a companion, or before the room has said, only the usual line', () => {
  assert.deepEqual(whispersFor(ro, { companion: null, examples: [] }), ['Scrie un mesaj…']);
  assert.deepEqual(whispersFor(ro, undefined), ['Scrie un mesaj…']);
});

test('whispers: the turn goes round, and one line stays where it is', () => {
  assert.equal(nextWhisper(0, 3), 1);
  assert.equal(nextWhisper(2, 3), 0);
  assert.equal(nextWhisper(0, 1), 0);
  assert.equal(nextWhisper(0, 0), 0);
});
