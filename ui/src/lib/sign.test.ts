import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OWN_MAX, SIGNS, TAKE_AFTER_MS, addOwnSign, isSign, ownSigns, signFrom, stepSign, tilesOf } from './sign.ts';

const memory = () => {
  const kept = new Map<string, string>();
  return { getItem: (k: string) => kept.get(k) ?? null, setItem: (k: string, v: string) => void kept.set(k, v) };
};

test('the set: creatures and weather, each one emoji, none of the protocol, which steers a talk', () => {
  assert.equal(SIGNS.length, 12);
  for (const sign of SIGNS) assert.ok(isSign(sign), sign);
  for (const mode of ['🫁', '🧭', '🐸']) assert.equal(SIGNS.includes(mode), false, mode);
});

test('a sign is one emoji: the same test as the portal makes', () => {
  for (const good of ['🎭', '🧙‍♂️', '👩🏽‍💻', '❤️', '🏳️‍🌈', '🇷🇴']) assert.equal(isSign(good), true, good);
  for (const bad of ['', 'lion', '🦁🦁', '🦁 ', '1️⃣', 'a🦁']) assert.equal(isSign(bad), false, bad);
});

test('your own signs come first, each once; a new one goes to the front, and the oldest beyond the limit goes', () => {
  const storage = memory();
  assert.deepEqual(ownSigns(storage), []);
  addOwnSign('🎭', storage);
  addOwnSign('🧙‍♂️', storage);
  assert.deepEqual(ownSigns(storage), ['🧙‍♂️', '🎭']);
  addOwnSign('🎭', storage); // again: to the front, not twice
  assert.deepEqual(ownSigns(storage), ['🎭', '🧙‍♂️']);
  assert.deepEqual(tilesOf(['🎭', '🦁']).slice(0, 3), ['🎭', '🦁', '🦉']); // one of yours that is in the set too shows once
  for (const sign of ['🎸', '🎲', '🛸', '🪐', '🦄', '🐉', '🌵', '🍕']) addOwnSign(sign, storage);
  assert.equal(ownSigns(storage).length, OWN_MAX);
  assert.equal(ownSigns(storage).includes('🧙‍♂️'), false);
});

test('what was kept and is not a sign, or is not a list, is let go; storage that throws is no reason to fail', () => {
  const storage = memory();
  storage.setItem('portal.signs', JSON.stringify(['🎭', 'lion', 3]));
  assert.deepEqual(ownSigns(storage), ['🎭']);
  storage.setItem('portal.signs', '{nope');
  assert.deepEqual(ownSigns(storage), []);
  const broken = { getItem: () => { throw new Error('forbidden'); }, setItem: () => { throw new Error('full'); } };
  assert.deepEqual(ownSigns(broken), []);
  assert.deepEqual(addOwnSign('🎭', broken), ['🎭']);
});

test('stepping goes round and round, from wherever you are', () => {
  const tiles = ['🎭', '🦁', '🦉'];
  assert.equal(stepSign(tiles, '🦁', 1), '🦉');
  assert.equal(stepSign(tiles, '🦉', 1), '🎭');
  assert.equal(stepSign(tiles, '🎭', -1), '🦉');
  assert.equal(stepSign(tiles, undefined, 1), '🎭');
  assert.equal(stepSign(tiles, '🌵', -1), '🦉'); // a sign not in the grid: from an end
});

test('what is typed is taken as a sign when it is exactly one, with the spaces around it let go, and not before', () => {
  assert.equal(signFrom('🎭'), '🎭');
  assert.equal(signFrom(' 🧙‍♂️ '), '🧙‍♂️');
  assert.equal(signFrom('🇷🇴'), '🇷🇴');
  for (const not of ['', '  ', 'a', '🦁🦁', '🦁a', '12']) assert.equal(signFrom(not), undefined, JSON.stringify(not));
  assert.ok(TAKE_AFTER_MS >= 300 && TAKE_AFTER_MS <= 800, 'long enough for a sequence to arrive, short enough not to be felt as a wait');
});
