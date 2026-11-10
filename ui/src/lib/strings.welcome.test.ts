import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stringsFor } from './strings.ts';

test('the welcome says three things and no more: the whisper, that nothing follows and all fades, that nothing is asked', () => {
  const t = stringsFor('en');
  assert.equal(t.guestFade(15), 'No history follows you here. Everything fades in 15 minutes.');
  assert.equal(t.guestRest, 'Speak to the room, or just rest.');
});

test('a portal that does not say how long still says that nothing follows, and promises no time', () => {
  for (const locale of ['en', 'ro', 'es']) assert.doesNotMatch(stringsFor(locale).guestFade(undefined), /\d/, locale);
});

test('minutes are said right in each language, at one and at many', () => {
  assert.match(stringsFor('en').guestFade(1), /in 1 minute\./);
  assert.match(stringsFor('en').guestFade(15), /in 15 minutes\./);
  assert.match(stringsFor('ro').guestFade(1), /în un minut\./);
  assert.match(stringsFor('ro').guestFade(15), /în 15 minute\./);
  assert.match(stringsFor('ro').guestFade(20), /în 20 de minute\./);
  assert.match(stringsFor('es').guestFade(15), /en 15 minutos\./);
});

test('the sheet of a visitor says who they write as and how long the visit has left, in each language', () => {
  assert.equal(stringsFor('en').guestAs('swift'), 'You are writing as swift.');
  assert.equal(stringsFor('en').guestEndsIn(1), 'Your visit ends in 1 minute.');
  assert.equal(stringsFor('ro').guestEndsIn(8), 'Vizita ta se încheie în 8 minute.');
  assert.equal(stringsFor('ro').guestEndsIn(20), 'Vizita ta se încheie în 20 de minute.');
  assert.equal(stringsFor('es').guestEndsIn(8), 'Tu visita termina en 8 minutos.');
  assert.equal(stringsFor('en').hereCount(3), '3 here');
});
