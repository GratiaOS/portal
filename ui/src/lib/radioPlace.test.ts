import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RADIO_PLACE, radioSits } from './radioPlace.ts';

test('the mushroom sits in the head of the channel on a wide page, and in the top bar on a narrow one, where the head is not shown', () => {
  assert.equal(radioSits('head', false), 'head');
  assert.equal(radioSits('head', true), 'topbar');
});

test('the other place is the same on every width: right above the box where people write', () => {
  assert.equal(radioSits('foot', false), 'foot');
  assert.equal(radioSits('foot', true), 'foot');
});

test('the chosen place is one the page knows', () => {
  assert.ok(['head', 'foot'].includes(RADIO_PLACE));
});
