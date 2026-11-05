import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bearingOf, peopleOf, thinkingIn } from './people.ts';
import { stringsFor } from './strings.ts';
import type { Participant } from './types.ts';

const person = (kind: Participant['kind'], alias: string): Participant => ({ id: `${kind}:${alias.toLowerCase()}`, kind, alias, capabilities: [] });
const all = [person('companion', 'Nova'), person('human', 'Zeus'), person('human', 'Éris'), person('human', 'Athena')];

test('humans first, then companions, alphabetical, and the order does not follow who is here', () => {
  const order = (presence: Record<string, { participantId: string; state: 'online' | 'offline' }>) => peopleOf(all, presence).map((p) => p.participant.alias);

  assert.deepEqual(order({}), ['Athena', 'Éris', 'Zeus', 'Nova']);
  assert.deepEqual(order({ 'human:zeus': { participantId: 'human:zeus', state: 'online' } }), ['Athena', 'Éris', 'Zeus', 'Nova']); // the same, with Zeus in
});

test('who is here: a person only when the room says so; a companion unless the room says she is not', () => {
  const people = peopleOf(all, { 'human:athena': { participantId: 'human:athena', state: 'online' }, 'human:zeus': { participantId: 'human:zeus', state: 'offline' } });
  assert.deepEqual(people.map((p) => [p.participant.alias, p.here]), [['Athena', true], ['Éris', false], ['Zeus', false], ['Nova', true]]);
});

test('who is thinking, in this channel only, by name', () => {
  const thinking = [
    { participantId: 'companion:nova', conversationId: 'olympus', state: 'thinking' as const },
    { participantId: 'human:athena', conversationId: 'general', state: 'thinking' as const },
    { participantId: 'companion:ghost', conversationId: 'olympus', state: 'thinking' as const },
  ];
  assert.deepEqual(thinkingIn('olympus', thinking, all), ['Nova', 'ghost']); // somebody the room no longer lists keeps the name from their id
  assert.deepEqual(thinkingIn('general', thinking, all), ['Athena']);
  assert.deepEqual(thinkingIn('nowhere', thinking, all), []);
  assert.deepEqual(thinkingIn(undefined, thinking, all), []);
});

test('how "thinking" is said, in each language, for one and for several', () => {
  assert.equal(stringsFor('ro-RO').thinking(['Nova']), 'Nova gândește…');
  assert.equal(stringsFor('ro').thinking(['Nova', 'Athena']), 'Nova, Athena gândesc…');
  assert.equal(stringsFor('en-GB').thinking(['Nova']), 'Nova is thinking…');
  assert.equal(stringsFor('en').thinking(['Nova', 'Athena']), 'Nova, Athena are thinking…');
  assert.equal(stringsFor(undefined).here, 'e aici');
});

test('bearing: the same for the same id, inside the scope, and nothing to do with when anyone was here', () => {
  const nova = bearingOf('companion:nova');
  assert.deepEqual(bearingOf('companion:nova'), nova);
  for (const id of ['companion:nova', 'human:athena', 'human:zeus', 'human:apollo', 'human:hermes', 'service:cron']) {
    const { angle, ring } = bearingOf(id);
    assert.ok(Number.isInteger(angle) && angle >= 0 && angle < 360, `${id} angle ${angle}`);
    assert.ok([1, 2, 3].includes(ring), `${id} ring ${ring}`);
  }
  assert.equal(new Set(['human:athena', 'human:zeus', 'human:apollo', 'human:hermes'].map((id) => bearingOf(id).angle)).size, 4); // the room's own four do not sit on top of each other
});
