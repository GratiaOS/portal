import assert from 'node:assert/strict';
import { test } from 'node:test';
import { blocksOf } from './blocks.ts';

test('blocks: a message without a fence is one piece of prose, as it was written', () => {
  assert.deepEqual(blocksOf('Salut!\nCe mai faci?'), [{ kind: 'text', text: 'Salut!\nCe mai faci?' }]);
  assert.deepEqual(blocksOf(''), []);
  assert.deepEqual(blocksOf('\n\nsalut\n'), [{ kind: 'text', text: 'salut' }]);
});

test('blocks: prose, a fenced block with its language, prose again', () => {
  const text = 'Iată:\n\n```mermaid\ngraph TD\n  A --> B\n```\n\npe scurt, atât.';
  assert.deepEqual(blocksOf(text), [
    { kind: 'text', text: 'Iată:' },
    { kind: 'code', lang: 'mermaid', code: 'graph TD\n  A --> B' },
    { kind: 'text', text: 'pe scurt, atât.' },
  ]);
});

test('blocks: the language is lower case and may be missing; indentation inside the block is kept', () => {
  assert.deepEqual(blocksOf('```JSON\n{ "a": 1 }\n```'), [{ kind: 'code', lang: 'json', code: '{ "a": 1 }' }]);
  assert.deepEqual(blocksOf('```\n  indentat\n```'), [{ kind: 'code', lang: '', code: '  indentat' }]);
  assert.deepEqual(blocksOf('```sql title="x"\nselect 1;\n```'), [{ kind: 'code', lang: 'sql', code: 'select 1;' }]);
});

test('blocks: a block never closed runs to the end', () => {
  assert.deepEqual(blocksOf('Uite:\n```go\nfunc main() {}\n'), [
    { kind: 'text', text: 'Uite:' },
    { kind: 'code', lang: 'go', code: 'func main() {}\n' },
  ]);
});

test('blocks: a fence of four holds a fence of three; the closing fence needs as many backticks as the opening', () => {
  const text = '````md\n```js\nx\n```\n````\nsfârșit';
  assert.deepEqual(blocksOf(text), [
    { kind: 'code', lang: 'md', code: '```js\nx\n```' },
    { kind: 'text', text: 'sfârșit' },
  ]);
});

test('blocks: backticks inside a line are inline code, not a fence', () => {
  assert.deepEqual(blocksOf('foloseste ```x``` in text'), [{ kind: 'text', text: 'foloseste ```x``` in text' }]);
  assert.deepEqual(blocksOf('o linie cu `cod` inline'), [{ kind: 'text', text: 'o linie cu `cod` inline' }]);
});

test('blocks: lines that end in CRLF are lines all the same', () => {
  const text = 'Iată:\r\n```json\r\n{ "a": 1 }\r\n```\r\npe scurt, atât.';
  assert.deepEqual(blocksOf(text), [
    { kind: 'text', text: 'Iată:' },
    { kind: 'code', lang: 'json', code: '{ "a": 1 }' },
    { kind: 'text', text: 'pe scurt, atât.' },
  ]);
});

test('blocks: several blocks keep their order', () => {
  const kinds = blocksOf('a\n```x\n1\n```\nb\n```y\n2\n```').map((b) => (b.kind === 'code' ? `code:${b.lang}` : 'text'));
  assert.deepEqual(kinds, ['text', 'code:x', 'text', 'code:y']);
});
