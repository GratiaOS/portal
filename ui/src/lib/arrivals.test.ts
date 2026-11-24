import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrivalsOf } from './arrivals.ts';
import type { Person } from './people.ts';

const person = (alias: string, here: boolean, kind: 'human' | 'companion' = 'human'): Person => ({ participant: { id: `${kind}:${alias.toLowerCase()}`, kind, alias, capabilities: [] }, here });

test('arrivals: those who are here now and were not at the last look', () => {
  const before = new Set(['human:quartz', 'companion:nova']);
  const people = [person('Quartz', true), person('Forge', true), person('Relay', false), person('Nova', true, 'companion')];
  assert.deepEqual(arrivalsOf(before, people), ['human:forge']);
});

test('arrivals: nobody on the first look, and nobody for those who leave', () => {
  const people = [person('Quartz', true), person('Forge', true)];
  assert.deepEqual(arrivalsOf(undefined, people), []); // already here when the page opened
  assert.deepEqual(arrivalsOf(new Set(['human:quartz', 'human:forge']), [person('Quartz', true), person('Forge', false)]), []); // she left: no goodbye
  assert.deepEqual(arrivalsOf(new Set(), []), []);
});

test('arrivals: someone who left and came back arrives again', () => {
  const people = [person('Forge', true)];
  assert.deepEqual(arrivalsOf(new Set(['human:quartz']), people), ['human:forge']);
  assert.deepEqual(arrivalsOf(new Set(['human:forge']), people), []);
});
