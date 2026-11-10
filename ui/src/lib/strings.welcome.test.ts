import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stringsFor } from './strings.ts';

test('the map says what the portal told and nothing it did not: no companion, no line about her', () => {
  const t = stringsFor('en');
  assert.match(t.guestMapAsk('Nova', 'what is a portal?'), /@Nova, what is a portal\?/);
  assert.match(t.guestMapAsk('Nova'), /start with @Nova/);
});

test('minutes are said right in each language, at one and at many', () => {
  assert.match(stringsFor('en').guestMapTrail(1), /after 1 minute\./);
  assert.match(stringsFor('en').guestMapTrail(15), /after 15 minutes\./);
  assert.match(stringsFor('ro').guestMapTrail(1), /după un minut\./);
  assert.match(stringsFor('ro').guestMapTrail(15), /după 15 minute\./);
  assert.match(stringsFor('ro').guestMapTrail(20), /după 20 de minute\./);
  assert.match(stringsFor('es').guestMapTrail(15), /a los 15 minutos\./);
});
