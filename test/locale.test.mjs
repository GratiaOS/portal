import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOCALES, fromAcceptLanguage, pickLocale } from '../dist/index.js';

test('the portal has three languages, and what it does not know falls to English', () => {
  assert.deepEqual([...LOCALES].sort(), ['en', 'es', 'ro']);
  for (const [tag, want] of [['ro', 'ro'], ['RO-ro', 'ro'], ['es', 'es'], ['es-AR', 'es'], ['es_MX', 'es'], ['en-GB', 'en'], ['fr', 'en'], ['', 'en'], [undefined, 'en'], [null, 'en'], ['español', 'en']]) {
    assert.equal(pickLocale(tag), want, `${tag}`);
  }
});

test('a visitor\'s preference is read in the order they gave it, by weight, and the first that is ours wins', () => {
  assert.equal(fromAcceptLanguage('es-ES,es;q=0.9,en;q=0.8'), 'es');
  assert.equal(fromAcceptLanguage('fr-FR,fr;q=0.9,ro;q=0.5,en;q=0.4'), 'ro');
  assert.equal(fromAcceptLanguage('en;q=0.3, es;q=0.8'), 'es');
  assert.equal(fromAcceptLanguage('es;q=0, en'), 'en', 'q=0 is "not this one"');
  assert.equal(fromAcceptLanguage('de, fr'), 'en');
  assert.equal(fromAcceptLanguage(undefined), 'en');
  assert.equal(fromAcceptLanguage('*'), 'en');
});
