import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addressedTo, clock, hueOf, rowsOf, splitSources, startsWithPicture } from './format.ts';
import type { Participant, Turn } from './types.ts';

const athena: Participant = { id: 'human:athena', kind: 'human', alias: 'Athena', capabilities: [] };
const nova: Participant = { id: 'companion:nova', kind: 'companion', alias: 'Nova', capabilities: [] };
const at = (minutes: number, speakerId = 'human:athena', seq = minutes): Turn => ({ seq, id: String(seq), conversationId: 'general', speakerId, text: 't', mentions: [], createdAt: new Date(Date.UTC(2026, 9, 29, 10, minutes)).toISOString() });

test('the clock is hours and minutes with a leading zero, on the reader\'s clock', () => {
  assert.equal(clock(new Date(2026, 0, 2, 9, 5).toISOString()), '09:05');
  assert.equal(clock(new Date(2026, 0, 2, 23, 59).toISOString()), '23:59');
});

test('a person keeps their colour: the same name, the same hue, within a circle', () => {
  assert.equal(hueOf('human:athena'), hueOf('human:athena'));
  assert.notEqual(hueOf('human:athena'), hueOf('human:poseidon'));
  for (const id of ['a', 'human:éris', 'companion:nova', '']) assert.ok(hueOf(id) >= 0 && hueOf(id) < 360);
});

test('a run by the same person shows the name once; another speaker, or a long pause, starts a new one', () => {
  const rows = rowsOf([at(0), at(1), at(2, 'companion:nova'), at(3), at(4), at(9)], [athena, nova]);
  assert.deepEqual(rows.map((r) => r.head), [true, false, true, true, false, true]); // the last one: five minutes after the one before
  assert.equal(rows[2]?.speaker?.alias, 'Nova');
  assert.equal(rowsOf([at(0, 'human:ghost')], [athena])[0]?.speaker, undefined); // somebody the room no longer lists
});

test('the sources Nova puts after an answer are told apart from the answer', () => {
  assert.deepEqual(splitSources('@Athena Riscul devine HIGH.\nSurse: reference/a.md, flows/b.canvas'), { body: '@Athena Riscul devine HIGH.', sources: ['reference/a.md', 'flows/b.canvas'] });
  assert.deepEqual(splitSources('Answer.\nSources: x.md'), { body: 'Answer.', sources: ['x.md'] });
  assert.deepEqual(splitSources('Doar text, cu Surse: în mijloc\nși mai departe'), { body: 'Doar text, cu Surse: în mijloc\nși mai departe', sources: [] });
});

test('a message is for the reader when it names them and they did not write it', () => {
  const to = (speakerId: string, mentions: string[]) => rowsOf([{ ...at(0, speakerId), mentions }], [athena, nova])[0]!;
  assert.equal(addressedTo(to('companion:nova', ['human:athena']), 'human:athena'), true); // her answer
  assert.equal(addressedTo(to('human:athena', ['human:athena']), 'human:athena'), false); // their own words
  assert.equal(addressedTo(to('companion:nova', []), 'human:athena'), false);
  assert.equal(addressedTo(to('human:athena', ['companion:nova']), 'human:athena'), false); // for someone else
  assert.equal(addressedTo(to('companion:nova', ['human:athena']), undefined), false); // nobody is reading yet
});

test('a title that begins with a picture has that for its mark, and the others keep the hash', () => {
  assert.equal(startsWithPicture('⛲ PlazaDelSol'), true);
  assert.equal(startsWithPicture('🅿️ Parking'), true);
  assert.equal(startsWithPicture('General'), false);
  assert.equal(startsWithPicture('1 Plaza'), false);
  assert.equal(startsWithPicture('Plaza ⛲'), false);
});
