import assert from 'node:assert/strict';
import { test } from 'node:test';
import { occurrencesIn, selectedWord } from './occurrences.ts';

test('occurrences: a word worth finding again is a name, a tag or a term, not a letter, a sentence or a mark', () => {
  assert.equal(selectedWord('Nova'), 'Nova');
  assert.equal(selectedWord('  @nova '), '@nova');
  assert.equal(selectedWord('#decizie'), '#decizie');
  assert.equal(selectedWord('risc-mare'), 'risc-mare');
  assert.equal(selectedWord('x'), undefined);
  assert.equal(selectedWord('două cuvinte'), undefined);
  assert.equal(selectedWord('a\nb'), undefined);
  assert.equal(selectedWord('--'), undefined);
  assert.equal(selectedWord('x'.repeat(41)), undefined);
  assert.equal(selectedWord(''), undefined);
});

test('occurrences: every place, whatever the case, even inside a longer word, without overlapping', () => {
  assert.deepEqual(occurrencesIn('Nova a zis; nova a rămas; ASTRONOVA', 'nova'), [0, 12, 31]);
  assert.deepEqual(occurrencesIn('aaaa', 'aa'), [0, 2]);
  assert.deepEqual(occurrencesIn('nimic aici', 'nova'), []);
  assert.deepEqual(occurrencesIn('İstanbul', 'istanbul'), []); // lower-casing changes its length: left alone, not wrong
});
