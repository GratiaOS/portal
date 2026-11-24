import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractMentions, participantId } from '../dist/index.js';

const people = [
  { kind: 'human', alias: 'Quartz' },
  { kind: 'human', alias: 'Forge' },
  { kind: 'human', alias: 'Éris' },
  { kind: 'human', alias: 'athena-maria' },
  { kind: 'companion', alias: 'Nova' },
].map((p) => ({ ...p, id: participantId(p.kind, p.alias), capabilities: [] }));

const ids = (text) => extractMentions(text, people);

test('ids are kind:alias in lowercase', () => {
  assert.equal(participantId('human', 'Quartz'), 'human:quartz');
  assert.equal(participantId('companion', 'Nova'), 'companion:nova');
});

test('a mention names a known participant, whatever the case', () => {
  assert.deepEqual(ids('@forge putem sari pasul cu Styx?'), ['human:forge']);
  assert.deepEqual(ids('hei @NOVA'), ['companion:nova']);
});

test('punctuation after the name is not part of it', () => {
  assert.deepEqual(ids('mulțumesc @nova, e clar'), ['companion:nova']);
  assert.deepEqual(ids('întreabă-l pe @quartz.'), ['human:quartz']);
  assert.deepEqual(ids('(@nova)'), ['companion:nova']);
  assert.deepEqual(ids("@nova's answer"), ['companion:nova']);
});

test('names with diacritics and inner dashes work', () => {
  assert.deepEqual(ids('@éris și @athena-maria'), ['human:éris', 'human:athena-maria']);
});

test('each participant once, in order of appearance', () => {
  assert.deepEqual(ids('@nova @quartz @nova'), ['companion:nova', 'human:quartz']);
});

test('unknown names and e-mail addresses are not mentions', () => {
  assert.deepEqual(ids('@nimeni nu e aici'), []);
  assert.deepEqual(ids('scrie la quartz@olympus.example'), []);
  assert.deepEqual(ids('nimic de văzut'), []);
  assert.deepEqual(ids('@'), []);
});
