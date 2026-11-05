import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emojiOnly, inlineOf } from './inline.ts';
import type { Participant } from './types.ts';

const nova: Participant = { id: 'companion:nova', kind: 'companion', alias: 'Nova', capabilities: [] };
const hera: Participant = { id: 'human:hera', kind: 'human', alias: 'Hera', capabilities: [] };
const kinds = (text: string, who: Participant[] = [], channels: string[] = []) => inlineOf(text, who, channels).map((p) => `${p.kind}:${p.text}`);

test('inline: a mention is someone the room says was mentioned, as it was written', () => {
  assert.deepEqual(kinds('@nova, ce zici?', [nova]), ['mention:@nova', 'text:, ce zici?']);
  assert.deepEqual(kinds('Mulțumesc @Hera. Și @nova!', [hera, nova]), ['text:Mulțumesc ', 'mention:@Hera', 'text:. Și ', 'mention:@nova', 'text:!']); // the dot ends the sentence
  assert.deepEqual(kinds('@zeus ești aici?', [nova]), ['text:@zeus ești aici?']); // nobody the room knows
  assert.deepEqual(kinds('scrie la nova@example.com', [nova]), ['text:scrie la nova@example.com']); // an address is not a mention
});

test('inline: a #word is a tag; a number, a channel, an entity and a heading are not', () => {
  assert.deepEqual(kinds('o #decizie luată'), ['text:o ', 'tag:#decizie', 'text: luată']);
  assert.deepEqual(kinds('#decizie la început, #risc-mare la sfârșit'), ['tag:#decizie', 'text: la început, ', 'tag:#risc-mare', 'text: la sfârșit']);
  assert.deepEqual(kinds('vezi #78 și PR#79'), ['text:vezi #78 și PR#79']);
  assert.deepEqual(kinds('vezi #general', [], ['general']), ['text:vezi #general']); // a channel points somewhere, it is not a mark
  assert.deepEqual(kinds('&#39; și # titlu și #x'), ['text:&#39; și # titlu și #x']);
  assert.deepEqual(kinds('#ÎNTREBARE?'), ['tag:#ÎNTREBARE', 'text:?']);
});

test('inline: a code span is taken as written, and nothing inside it is a mention or a tag', () => {
  assert.deepEqual(kinds('apasă `kill switch` acum'), ['text:apasă ', 'code:kill switch', 'text: acum']);
  assert.deepEqual(kinds('`@nova #risc` e cod, @nova nu', [nova]), ['code:@nova #risc', 'text: e cod, ', 'mention:@nova', 'text: nu']);
  assert.deepEqual(kinds('o ``bucată ` cu un backtick`` aici'), ['text:o ', 'code:bucată ` cu un backtick', 'text: aici']);
  assert.deepEqual(kinds('un ` rămas deschis'), ['text:un ` rămas deschis']); // never closed: it is text
  assert.deepEqual(kinds('``` nu e inline'), ['text:``` nu e inline']);
  assert.deepEqual(kinds('prima ` linie\nși `a doua`'), ['text:prima ` linie\nși ', 'code:a doua']); // a span does not cross a line
});

test('inline: it is all there, in order, and nothing is lost', () => {
  const text = 'salut @Hera, `x` #bun și @nova 🙂 &amp; mai mult';
  const back = inlineOf(text, [hera, nova]).map((p) => (p.kind === 'code' ? `\`${p.text}\`` : p.text)).join('');
  assert.equal(back, text);
});

test('emoji: one to three of them and nothing else make a message worth showing large', () => {
  assert.equal(emojiOnly('🐲'), 1);
  assert.equal(emojiOnly('  👍  '), 1);
  assert.equal(emojiOnly('🙂 🙂'), 2);
  assert.equal(emojiOnly('👩‍🚀'), 1); // a joined sign is one
  assert.equal(emojiOnly('❤️'), 1);
  assert.equal(emojiOnly('🇷🇴'), 1);
  assert.equal(emojiOnly('1️⃣'), 1);
  assert.equal(emojiOnly('🙂🙂🙂'), 3);
  assert.equal(emojiOnly('🙂🙂🙂🙂'), 0); // four is a row of them, and reads as text
  assert.equal(emojiOnly('ok 🙂'), 0);
  assert.equal(emojiOnly('1'), 0); // a digit by itself is a digit
  assert.equal(emojiOnly('™'), 0);
  assert.equal(emojiOnly(''), 0);
  assert.equal(emojiOnly('   '), 0);
});
