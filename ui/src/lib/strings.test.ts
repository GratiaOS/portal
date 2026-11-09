import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOCALES, pickLocale, stringsFor } from './strings.ts';

test('the page speaks Romanian, English and Spanish, and anything else in English', () => {
  assert.deepEqual([...LOCALES].sort(), ['en', 'es', 'ro']);
  assert.equal(stringsFor('ro').send, 'Trimite');
  assert.equal(stringsFor('es-AR').send, 'Enviar');
  assert.equal(stringsFor('en-GB').send, 'Send');
  assert.equal(stringsFor('fr').send, 'Send');
  assert.equal(stringsFor(undefined).send, 'Send');
  assert.equal(pickLocale('es_MX'), 'es');
});

test('every sentence the page has is in all three languages, with the same shape', () => {
  const [ro, en, es] = [stringsFor('ro'), stringsFor('en'), stringsFor('es')];
  const shape = (value: unknown): unknown => (typeof value === 'function' ? 'fn' : Array.isArray(value) ? `list${value.length}` : typeof value === 'object' && value ? Object.keys(value).sort().join() : typeof value);
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    assert.equal(shape(es[key]), shape(en[key]), `es.${key}`);
    assert.equal(shape(ro[key]), shape(en[key]), `ro.${key}`);
    if (typeof en[key] === 'string') assert.ok((es[key] as string).length > 0, `es.${key} is empty`);
  }
  assert.equal(es.guestOthers(1), 'Hay alguien más aquí.');
  assert.equal(es.thinking(['Nova']), 'Nova piensa…');
});

test('a visitor is told, in their language, that the room is read by those in it and by whoever runs the portal', () => {
  assert.match(stringsFor('en').guestNotPrivate, /everyone in the room, and by whoever runs the portal/);
  assert.match(stringsFor('ro').guestNotPrivate, /oricine e în cameră și de cine rulează portalul/);
  assert.match(stringsFor('es').guestNotPrivate, /cualquiera que esté en la sala, y quien administra el portal/);
});

test('the whisper of the place a visitor finds in an empty room is the family\'s own line, in each language', () => {
  assert.equal(stringsFor('en').guestWelcome, 'Many wings, same flight.');
  assert.equal(stringsFor('ro').guestWelcome, 'Multe aripi, același zbor.');
  assert.equal(stringsFor('es').guestWelcome, 'Muchas alas, un mismo vuelo.');
});
