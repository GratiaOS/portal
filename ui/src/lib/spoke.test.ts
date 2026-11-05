import assert from 'node:assert/strict';
import { test } from 'node:test';
import { speakersBetween } from './spoke.ts';
import type { Turn } from './types.ts';

const turn = (seq: number, speakerId: string, conversationId = 'general'): Turn => ({ seq, id: `id-${seq}`, conversationId, speakerId, text: `m${seq}`, mentions: [], createdAt: '2026-10-29T10:00:00Z' });

test('speakers: those who said something after the mark, each once, in the order they first spoke', () => {
  const turns = { general: [turn(1, 'human:athena'), turn(2, 'human:zeus'), turn(4, 'human:athena'), turn(5, 'companion:nova')], ops: [turn(3, 'human:apollo', 'ops')] };
  assert.deepEqual(speakersBetween(turns, 1, 5), ['human:zeus', 'human:apollo', 'human:athena', 'companion:nova']);
  assert.deepEqual(speakersBetween(turns, 2, 3), ['human:apollo']);
  assert.deepEqual(speakersBetween(turns, 5, 5), []);
  assert.deepEqual(speakersBetween({}, 0, 9), []);
});

test('speakers: what is above the cursor does not count yet', () => {
  assert.deepEqual(speakersBetween({ general: [turn(1, 'human:athena'), turn(7, 'human:zeus')] }, 0, 3), ['human:athena']);
});
