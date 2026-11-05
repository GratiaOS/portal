import assert from 'node:assert/strict';
import { test } from 'node:test';
import { arrivalsOf } from './arrivals.ts';
import type { Person } from './people.ts';

const person = (alias: string, here: boolean, kind: 'human' | 'companion' = 'human'): Person => ({ participant: { id: `${kind}:${alias.toLowerCase()}`, kind, alias, capabilities: [] }, here });

test('arrivals: those who are here now and were not at the last look', () => {
  const before = new Set(['human:zeus', 'companion:nova']);
  const people = [person('Zeus', true), person('Hera', true), person('Athena', false), person('Nova', true, 'companion')];
  assert.deepEqual(arrivalsOf(before, people), ['human:hera']);
});

test('arrivals: nobody on the first look, and nobody for those who leave', () => {
  const people = [person('Zeus', true), person('Hera', true)];
  assert.deepEqual(arrivalsOf(undefined, people), []); // already here when the page opened
  assert.deepEqual(arrivalsOf(new Set(['human:zeus', 'human:hera']), [person('Zeus', true), person('Hera', false)]), []); // she left: no goodbye
  assert.deepEqual(arrivalsOf(new Set(), []), []);
});

test('arrivals: someone who left and came back arrives again', () => {
  const people = [person('Hera', true)];
  assert.deepEqual(arrivalsOf(new Set(['human:zeus']), people), ['human:hera']);
  assert.deepEqual(arrivalsOf(new Set(['human:hera']), people), []);
});
