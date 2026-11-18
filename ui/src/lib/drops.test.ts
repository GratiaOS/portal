import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SIGIL, DROPS_HASH, FLOOR, TUNING_CHARS, fadeLevel, sigilOf, stillThere, tuned, wantsDrops } from './drops.ts';
import type { Drop } from './types.ts';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.UTC(2026, 10, 18, 9, 0, 0);

const drop = (id: string, fadesAt: number): Drop => ({ id, type: 'drop', payload: { body: id, format: 'note' }, fadesAt });

test('the box is asked for by a hash no room can have, since a room id starts with a letter or a digit', () => {
  assert.equal(DROPS_HASH, '~drops');
  assert.equal(wantsDrops('~drops'), true);
  for (const other of ['general', 'drops', '', undefined, '~drops2']) assert.equal(wantsDrops(other), false, String(other));
});

test('a fade is how much is left, drawn on a scale of time: a week is full, a minute is a trace, and nothing past the end', () => {
  assert.equal(fadeLevel(NOW + 7 * DAY, NOW), 1);
  assert.equal(fadeLevel(NOW + 30 * DAY, NOW), 1); // more than a week is as full as a week
  assert.equal(fadeLevel(NOW + MINUTE, NOW), FLOOR);
  assert.equal(fadeLevel(NOW + 10_000, NOW), FLOOR); // under a minute is still a trace, not nothing, until it is gone
  assert.equal(fadeLevel(NOW, NOW), 0); // the second it is reached it is gone
  assert.equal(fadeLevel(NOW - 1, NOW), 0);
});

test('a fade only ever goes down as time goes on, and a day is not drawn as a seventh of a week', () => {
  let last = 2;
  for (const left of [7 * DAY, 3 * DAY, DAY, 6 * HOUR, HOUR, 10 * MINUTE, 2 * MINUTE, MINUTE]) {
    const level = fadeLevel(NOW + left, NOW);
    assert.ok(level < last || (level === 1 && last === 1), `${left} left is ${level}, after ${last}`);
    last = level;
  }
  assert.ok(fadeLevel(NOW + DAY, NOW) > 0.7); // a day left still reads as a lot
  assert.ok(fadeLevel(NOW + HOUR, NOW) < 0.55 && fadeLevel(NOW + HOUR, NOW) > 0.3);
});

test('what has faded is no longer there, even if the page has not asked again', () => {
  const kept = [drop('a', NOW + 1), drop('b', NOW), drop('c', NOW - 5), drop('d', NOW + DAY)];
  assert.deepEqual(stillThere(kept, NOW).map((d) => d.id), ['a', 'd']); // the order it came in stays
  assert.deepEqual(stillThere([], NOW), []);
  assert.equal(stillThere(kept, NOW) === kept, false); // never the same list: a render keyed on it sees the change
});

test('a packet shows the sigil it was sealed with, or the page\'s own when it came with none', () => {
  assert.equal(DEFAULT_SIGIL, '🐲'); // the same one Amigo puts on a signal that has none
  assert.equal(sigilOf({ ...drop('a', NOW + 1), payload: { body: 'a', format: 'note', sigil: '🦁' } }), '🦁');
  assert.equal(sigilOf(drop('a', NOW + 1)), DEFAULT_SIGIL);
  assert.equal(sigilOf({ ...drop('a', NOW + 1), payload: { body: 'a', format: 'note', sigil: '' } }), DEFAULT_SIGIL);
});

// the tuning: when the seal is broken the words are not shown at once, they settle out of noise, as in Amigo's Room
const noise = (text: string) => [...text].every((char) => /\s/.test(char) || TUNING_CHARS.includes(char));

test('tuning: at the start it is all noise, at the end it is the words, and in between the words settle from the left', () => {
  const text = 'Coffee tonight?\nSame place.';
  const first = tuned(text, 0, () => 0);
  assert.equal(first.length, text.length);
  assert.equal(noise(first), true);
  assert.equal(tuned(text, 1, () => 0), text);
  assert.equal(tuned(text, 2, () => 0), text); // past the end is the end
  assert.equal(tuned(text, -1, () => 0).length, text.length);
  const half = tuned(text, 0.5, () => 0);
  const letters = [...text].filter((c) => !/\s/.test(c)).length;
  const settled = [...half].filter((c, i) => c === [...text][i] && !/\s/.test(c)).length;
  assert.ok(settled >= Math.floor(letters / 2) - 1 && settled <= Math.ceil(letters / 2) + 1, `${settled} of ${letters} settled`);
  assert.equal(half.startsWith('Coffee'), true); // from the left
});

test('tuning keeps the shape of the words: spaces and line breaks stay where they are, and nothing is cut in the middle of an emoji', () => {
  const text = 'a b\n\nc 🦁 d';
  for (const progress of [0, 0.3, 0.6, 1]) {
    const out = tuned(text, progress, () => 0.5);
    assert.deepEqual([...out].map((c) => /\s/.test(c)), [...text].map((c) => /\s/.test(c)), String(progress));
  }
  assert.equal(tuned('', 0.5), '');
  assert.equal(noise(tuned('🦁🦁', 0, () => 0.9)), true); // an emoji is one thing to hide, not two halves
});
